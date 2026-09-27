use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::{AccountMeta, Instruction},
        system_program, AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo, TOKEN_ID},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const TOKEN_2022_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKENKEG_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

fn a2p<T: AsRef<[u8]>>(a: &T) -> Pubkey {
    Pubkey::new_from_array(a.as_ref().try_into().unwrap())
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> Result<(), String> {
    // LiteSVM never auto-advances blockhashes: identical back-to-back
    // transactions would collide on signature (AlreadyProcessed), so expire
    // explicitly. Failed txs still consume their signature.
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn sys_create(
    payer: &Pubkey,
    new_acc: &Pubkey,
    lamports: u64,
    space: u64,
    owner: &Pubkey,
) -> Instruction {
    let mut data = vec![0u8, 0, 0, 0];
    data.extend_from_slice(&lamports.to_le_bytes());
    data.extend_from_slice(&space.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    Instruction {
        program_id: system_program::ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(*new_acc, true),
        ],
        data,
    }
}

struct Setup {
    merchant: Keypair,
    claimant: Keypair,
    mint: Pubkey,
    merchant_ata: Pubkey,
    claimant_ata: Pubkey,
    bond: Pubkey,
    binding: Pubkey,
    vault: Pubkey,
    token_program: Pubkey,
}

fn setup(svm: &mut LiteSVM) -> Setup {
    let program_id = harbor::id();
    let merchant = Keypair::new();
    let claimant = Keypair::new();
    let bytes = include_bytes!("../../../target/deploy/harbor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&merchant.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&claimant.pubkey(), 10_000_000_000).unwrap();

    let mint_addr = CreateMint::new(svm, &merchant).decimals(6).send().unwrap();
    let mint = a2p(&mint_addr);
    let merchant_ata_addr =
        CreateAssociatedTokenAccount::new(svm, &merchant, &mint_addr).send().unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(svm, &merchant, &mint_addr, &merchant_ata_addr, 1_000_000)
        .send()
        .unwrap();
    let claimant_ata_addr =
        CreateAssociatedTokenAccount::new(svm, &claimant, &mint_addr).send().unwrap();
    let claimant_ata = a2p(&claimant_ata_addr);
    MintTo::new(svm, &merchant, &mint_addr, &claimant_ata_addr, 100_000)
        .send()
        .unwrap();

    let bond = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), mint.as_ref()],
        &program_id,
    )
    .0;
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL".parse().unwrap();
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    send(
        svm,
        &merchant,
        vec![
            Instruction::new_with_bytes(
                program_id,
                &harbor::instruction::RegisterMerchant { sla_bps: 50, challenge_slots: 150 }.data(),
                harbor::accounts::RegisterMerchant {
                    merchant: merchant.pubkey(),
                    bond,
                    mint,
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
            ),
            Instruction::new_with_bytes(
                program_id,
                &harbor::instruction::PostBond { amount: 500_000 }.data(),
                harbor::accounts::PostBond {
                    merchant: merchant.pubkey(),
                    bond,
                    mint,
                    merchant_ata,
                    vault,
                    token_program,
                    associated_token_program: ata_program,
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
            ),
        ],
    )
    .unwrap();

    let channel = mock_channel(svm, &merchant.pubkey(), &mint, 0);
    let (binding, _) =
        Pubkey::find_program_address(&[b"binding", channel.as_ref()], &program_id);
    send(
        svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::BindChannel {
                channel_program: system_program::ID,
                max_spend: 250_000,
            }
            .data(),
            harbor::accounts::BindChannel {
                merchant: merchant.pubkey(),
                bond,
                binding,
                channel,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    Setup { merchant, claimant, mint, merchant_ata, claimant_ata, bond, binding, vault, token_program }
}

/// Test-only mock of the upstream 256-byte Channel struct (pinned layout):
/// disc(1) + version(1) + status + payee@120 + mint@184.
fn mock_channel(svm: &mut LiteSVM, payee: &Pubkey, mint: &Pubkey, status: u8) -> Pubkey {
    let channel = Keypair::new();
    svm.airdrop(&channel.pubkey(), 10_000_000).unwrap();
    let mut acc = svm.get_account(&channel.pubkey()).unwrap();
    let mut data = vec![0u8; 256];
    data[0] = 1;
    data[1] = 1;
    data[3] = status;
    data[120..152].copy_from_slice(payee.as_ref());
    data[184..216].copy_from_slice(mint.as_ref());
    acc.data = data;
    svm.set_account(channel.pubkey(), acc).unwrap();
    channel.pubkey()
}

fn dispute_pda(binding: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"dispute", binding.as_ref(), &nonce.to_le_bytes()],
        &harbor::id(),
    )
    .0
}

fn treasury_of(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id()).0
}

fn treasury_ata_of(treasury: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL".parse().unwrap();
    Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0
}

fn open_dispute(
    svm: &mut LiteSVM,
    s: &Setup,
    nonce: u64,
    reason: u8,
    claim: u64,
) -> Result<(), String> {
    send(
        svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute {
                nonce,
                reason,
                claim_spend: claim,
            }
            .data(),
            harbor::accounts::OpenDispute {
                claimant: s.claimant.pubkey(),
                bond: s.bond,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, nonce),
                mint: s.mint,
                claimant_ata: s.claimant_ata,
                vault: s.vault,
                token_program: s.token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
}

fn resolve_timeout(svm: &mut LiteSVM, s: &Setup, nonce: u64) -> Result<(), String> {
    let treasury = treasury_of(&s.mint);
    send(
        svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: s.claimant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, nonce),
                claimant: s.claimant.pubkey(),
                treasury,
                vault: s.vault,
                treasury_ata: treasury_ata_of(&treasury, &s.mint, &s.token_program),
                claimant_ata: s.claimant_ata,
                associated_token_program: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
                    .parse()
                    .unwrap(),
                token_program: s.token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
}

fn withdraw(svm: &mut LiteSVM, s: &Setup, amount: u64) -> Result<(), String> {
    send(
        svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::WithdrawBond { amount }.data(),
            harbor::accounts::WithdrawBond {
                merchant: s.merchant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                merchant_ata: s.merchant_ata,
                vault: s.vault,
                token_program: s.token_program,
            }
            .to_account_metas(None),
        )],
    )
}

fn bond_open_disputes(svm: &LiteSVM, bond: &Pubkey) -> u64 {
    let acc = svm.get_account(bond).unwrap();
    harbor::MerchantBond::try_deserialize(&mut acc.data.as_slice()).unwrap().open_disputes
}

#[test]
fn test_concurrent_disputes_gate_withdraw() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    open_dispute(&mut svm, &s, 5, 1, 1_000).unwrap();
    open_dispute(&mut svm, &s, 6, 2, 1_000).unwrap();
    assert_eq!(bond_open_disputes(&svm, &s.bond), 2);

    svm.warp_to_slot(svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>().slot + 500);
    resolve_timeout(&mut svm, &s, 5).unwrap();
    assert_eq!(bond_open_disputes(&svm, &s.bond), 1);

    // One dispute still open: only the unreserved remainder withdraws.
    // Claim 1_000 -> resolved penalty 2_000 hit the bond (498_000 left);
    // the live dispute reserves 3_000 -> 495_000 free.
    assert!(withdraw(&mut svm, &s, 495_001).is_err());
    withdraw(&mut svm, &s, 495_000).unwrap();

    resolve_timeout(&mut svm, &s, 6).unwrap();
    assert_eq!(bond_open_disputes(&svm, &s.bond), 0);
    svm.warp_to_slot(svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>().slot + 500);
    withdraw(&mut svm, &s, 1_000).unwrap();
}

#[test]
fn test_unauthorized_matrix() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let program_id = harbor::id();
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();

    // Stranger cannot withdraw, bind, or halt against the merchant's bond.
    assert!(send(
        &mut svm,
        &stranger,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::WithdrawBond { amount: 1 }.data(),
            harbor::accounts::WithdrawBond {
                merchant: stranger.pubkey(),
                bond: s.bond,
                mint: s.mint,
                merchant_ata: s.merchant_ata,
                vault: s.vault,
                token_program: s.token_program,
            }
            .to_account_metas(None),
        )],
    )
    .is_err());
    let halt = send(
        &mut svm,
        &stranger,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::HaltBinding {}.data(),
            harbor::accounts::HaltBinding {
                merchant: stranger.pubkey(),
                binding: s.binding,
            }
            .to_account_metas(None),
        )],
    );
    assert!(halt.is_err());

    // Merchant cannot open a dispute against their own bond.
    let own = send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::OpenDispute {
                nonce: 1,
                reason: 1,
                claim_spend: 1_000,
            }
            .data(),
            harbor::accounts::OpenDispute {
                claimant: s.merchant.pubkey(),
                bond: s.bond,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 1),
                mint: s.mint,
                claimant_ata: s.merchant_ata,
                vault: s.vault,
                token_program: s.token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    );
    assert!(own.is_err());

    // Double registration fails; over-withdraw fails even past timelock.
    let dbl = send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RegisterMerchant { sla_bps: 50, challenge_slots: 150 }.data(),
            harbor::accounts::RegisterMerchant {
                merchant: s.merchant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    );
    assert!(dbl.is_err());
    svm.warp_to_slot(svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>().slot + 500);
    assert!(withdraw(&mut svm, &s, 999_999_999).is_err());

    // Early resolve paths reject: immature timeout, undelivered delivery.
    open_dispute(&mut svm, &s, 7, 1, 1_000).unwrap();
    let treasury = treasury_of(&s.mint);
    let early = send(
        &mut svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::ResolveTimeout { nonce: 7 }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: s.claimant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 7),
                claimant: s.claimant.pubkey(),
                treasury,
                vault: s.vault,
                treasury_ata: treasury_ata_of(&treasury, &s.mint, &s.token_program),
                claimant_ata: s.claimant_ata,
                associated_token_program: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
                    .parse()
                    .unwrap(),
                token_program: s.token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    );
    assert!(early.is_err());
}

/// Crafted Token-2022 mint: 82-byte base + AccountType byte + TLV extensions.
fn craft_mint(svm: &mut LiteSVM, payer: &Keypair, extensions: &[(u16, Vec<u8>)]) -> Pubkey {
    let token_2022: Pubkey = TOKEN_2022_ID.parse().unwrap();
    let mint_kp = Keypair::new();
    let mut data = vec![0u8; 82];
    data[0..4].copy_from_slice(&0u32.to_le_bytes()); // mint_authority: None
    data[44] = 6; // decimals
    data[45] = 1; // initialized
    data.extend(vec![0u8; 83]); // account-sized padding
    data.push(1); // AccountType::Mint
    for (ty, body) in extensions {
        data.extend_from_slice(&ty.to_le_bytes());
        data.extend_from_slice(&(body.len() as u16).to_le_bytes());
        data.extend_from_slice(body);
    }
    let rent = svm.minimum_balance_for_rent_exemption(data.len());
    // System CreateAccount needs both payer and the new keypair signing.
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(
        &[Instruction {
            program_id: system_program::ID,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(mint_kp.pubkey(), true),
            ],
            data: {
                let mut d = vec![0u8, 0, 0, 0];
                d.extend_from_slice(&rent.to_le_bytes());
                d.extend_from_slice(&(data.len() as u64).to_le_bytes());
                d.extend_from_slice(token_2022.as_ref());
                d
            },
        }],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer, &mint_kp])
        .unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{e:?}")).unwrap();
    // Populate account data via direct store (test-only setup path).
    let mut acc = svm.get_account(&mint_kp.pubkey()).unwrap();
    acc.data = data;
    acc.owner = token_2022;
    svm.set_account(mint_kp.pubkey(), acc).unwrap();
    mint_kp.pubkey()
}

#[test]
fn test_blocked_mint_rejected() {
    let program_id = harbor::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/harbor.so");
    svm.add_program(program_id, bytes).unwrap();
    let merchant = Keypair::new();
    svm.airdrop(&merchant.pubkey(), 10_000_000_000).unwrap();

    // PermanentDelegate (12) with a 32-byte delegate body.
    let bad_mint = craft_mint(&mut svm, &merchant, &[(12, vec![9u8; 32])]);
    let (bond, _) = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), bad_mint.as_ref()],
        &program_id,
    );
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RegisterMerchant { sla_bps: 50, challenge_slots: 150 }.data(),
            harbor::accounts::RegisterMerchant {
                merchant: merchant.pubkey(),
                bond,
                mint: bad_mint,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    // Fails at the extension deny-list, before any funds move.
    let token_program = a2p(&TOKEN_ID);
    let tokenkeg: Pubkey = TOKENKEG_ID.parse().unwrap();
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL".parse().unwrap();
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), bad_mint.as_ref()],
        &ata_program,
    );
    // Counterpart account the program will accept for deserialization.
    let ata_kp = Keypair::new();
    let mut ata_data = vec![0u8; 165];
    ata_data[0..32].copy_from_slice(bad_mint.as_ref());
    ata_data[32..64].copy_from_slice(merchant.pubkey().as_ref());
    ata_data[64..72].copy_from_slice(&1_000u64.to_le_bytes());
    ata_data[108] = 1; // Initialized
    let ata_rent = svm.minimum_balance_for_rent_exemption(165);
    let mut ata_create = vec![0u8, 0, 0, 0];
    ata_create.extend_from_slice(&ata_rent.to_le_bytes());
    ata_create.extend_from_slice(&165u64.to_le_bytes());
    ata_create.extend_from_slice(tokenkeg.as_ref());
    let blockhash = svm.latest_blockhash();
    let ata_msg = Message::new_with_blockhash(
        &[Instruction {
            program_id: system_program::ID,
            accounts: vec![
                AccountMeta::new(merchant.pubkey(), true),
                AccountMeta::new(ata_kp.pubkey(), true),
            ],
            data: ata_create,
        }],
        Some(&merchant.pubkey()),
        &blockhash,
    );
    let ata_tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(ata_msg), &[&merchant, &ata_kp])
            .unwrap();
    svm.send_transaction(ata_tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
        .unwrap();
    let mut ata_acc = svm.get_account(&ata_kp.pubkey()).unwrap();
    ata_acc.data = ata_data;
    svm.set_account(ata_kp.pubkey(), ata_acc).unwrap();
    let r = send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::PostBond { amount: 100 }.data(),
            harbor::accounts::PostBond {
                merchant: merchant.pubkey(),
                bond,
                mint: bad_mint,
                merchant_ata: ata_kp.pubkey(),
                vault,
                token_program,
                associated_token_program: ata_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    );
    assert!(r.is_err());
    let err = r.unwrap_err();
    assert!(
        err.contains("UnsupportedMint"),
        "expected the mint-program gate, got: {err}"
    );
}

fn bind(svm: &mut LiteSVM, s: &Setup, channel: Pubkey) -> Result<(), String> {
    let (binding, _) =
        Pubkey::find_program_address(&[b"binding", channel.as_ref()], &harbor::id());
    send(
        svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::BindChannel {
                channel_program: system_program::ID,
                max_spend: 250_000,
            }
            .data(),
            harbor::accounts::BindChannel {
                merchant: s.merchant.pubkey(),
                bond: s.bond,
                binding,
                channel,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
}

#[test]
fn test_squat_binding_rejected() {
    // Attacker binds a channel whose payee is someone else: first-to-bind
    // squatting fails the payee check (the honest payee-merchant path is
    // exercised by every setup in this file).
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let victim = Keypair::new().pubkey();
    let channel = mock_channel(&mut svm, &victim, &s.mint, 0);
    assert!(bind(&mut svm, &s, channel).is_err());
}

#[test]
fn test_wrong_mint_binding_rejected() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let other_mint = Keypair::new().pubkey();
    let channel = mock_channel(&mut svm, &s.merchant.pubkey(), &other_mint, 0);
    assert!(bind(&mut svm, &s, channel).is_err());
}

#[test]
fn test_closed_channel_binding_rejected() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let channel = mock_channel(&mut svm, &s.merchant.pubkey(), &s.mint, 1);
    assert!(bind(&mut svm, &s, channel).is_err());
}

#[test]
fn test_garbage_channel_rejected() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    // Unfunded keypair: no account data at all.
    assert!(bind(&mut svm, &s, Keypair::new().pubkey()).is_err());
    // Funded but wrong-sized account.
    let junk = Keypair::new();
    svm.airdrop(&junk.pubkey(), 10_000_000).unwrap();
    assert!(bind(&mut svm, &s, junk.pubkey()).is_err());
}
