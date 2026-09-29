use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{clock::Clock, instruction::Instruction},
        system_program, AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo, TOKEN_ID},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn a2p<T: AsRef<[u8]>>(a: &T) -> Pubkey {
    Pubkey::new_from_array(a.as_ref().try_into().unwrap())
}

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let acc = svm.get_account(ata).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn lamports(svm: &LiteSVM, addr: &Pubkey) -> u64 {
    svm.get_account(addr).map(|a| a.lamports).unwrap_or(0)
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn ed25519_ix(signer: &Keypair, msg: &[u8]) -> Instruction {
    let sig = signer.sign_message(msg);
    let program_id: Pubkey = "Ed25519SigVerify111111111111111111111111111"
        .parse()
        .unwrap();
    let mut data = vec![1u8, 0];
    data.extend_from_slice(&48u16.to_le_bytes());
    data.extend_from_slice(&0xFFFFu16.to_le_bytes());
    data.extend_from_slice(&16u16.to_le_bytes());
    data.extend_from_slice(&0xFFFFu16.to_le_bytes());
    data.extend_from_slice(&112u16.to_le_bytes());
    data.extend_from_slice(&(msg.len() as u16).to_le_bytes());
    data.extend_from_slice(&0xFFFFu16.to_le_bytes());
    data.extend_from_slice(signer.pubkey().as_ref());
    data.extend_from_slice(sig.as_ref());
    data.extend_from_slice(msg);
    Instruction {
        program_id,
        accounts: vec![],
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
    channel: Pubkey,
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

    let mint_addr = CreateMint::new(svm, &merchant)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);

    let merchant_ata_addr =
        CreateAssociatedTokenAccount::new(svm, &merchant, &mint_addr)
            .send()
            .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(svm, &merchant, &mint_addr, &merchant_ata_addr, 1_000_000)
        .send()
        .unwrap();

    let claimant_ata = a2p(
        &CreateAssociatedTokenAccount::new(svm, &claimant, &mint_addr)
            .send()
            .unwrap(),
    );
    MintTo::new(svm, &merchant, &mint_addr, &claimant_ata, 100_000)
        .send()
        .unwrap();

    let bond = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), mint.as_ref()],
        &program_id,
    )
    .0;
    send(
        svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RegisterMerchant {
                sla_bps: 50,
                challenge_slots: 150,
            }
            .data(),
            harbor::accounts::RegisterMerchant {
                merchant: merchant.pubkey(),
                bond,
                mint,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    send(
        svm,
        &merchant,
        vec![Instruction::new_with_bytes(
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
        )],
    )
    .unwrap();

    let channel = mock_channel(svm, &claimant.pubkey(), &merchant.pubkey(), &mint, 0);
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

    Setup {
        merchant,
        claimant,
        mint,
        merchant_ata,
        claimant_ata,
        bond,
        binding,
        channel,
        vault,
        token_program,
    }
}

fn receipt_pda(binding: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"receipt", binding.as_ref(), &nonce.to_le_bytes()],
        &harbor::id(),
    )
    .0
}

/// Test-only mock of the upstream 256-byte Channel struct (pinned layout):
/// disc(1) + version(1) + status + payer@88 + payee@120 + mint@184.
fn mock_channel(
    svm: &mut LiteSVM,
    payer: &Pubkey,
    payee: &Pubkey,
    mint: &Pubkey,
    status: u8,
) -> Pubkey {
    let channel = Keypair::new();
    svm.airdrop(&channel.pubkey(), 10_000_000).unwrap();
    let mut acc = svm.get_account(&channel.pubkey()).unwrap();
    let mut data = vec![0u8; 256];
    data[0] = 1;
    data[1] = 1;
    data[3] = status;
    data[88..120].copy_from_slice(payer.as_ref());
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

fn claim_pda(binding: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"claim", binding.as_ref(), &nonce.to_le_bytes()],
        &harbor::id(),
    )
    .0
}


fn treasury_of(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id()).0
}

fn treasury_ata_of(treasury: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();
    Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0
}

#[allow(clippy::too_many_arguments)]
fn open(
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
                channel: s.channel,
                dispute: dispute_pda(&s.binding, nonce),
                claim: claim_pda(&s.binding, nonce),
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

fn resolve(
    svm: &mut LiteSVM,
    s: &Setup,
    nonce: u64,
    resolver: &Keypair,
) -> Result<(), String> {
    let treasury = treasury_of(&s.mint);
    send(
        svm,
        resolver,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: resolver.pubkey(),
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

fn bond_field(svm: &LiteSVM, bond: &Pubkey, f: impl Fn(&harbor::MerchantBond) -> u64) -> u64 {
    let acc = svm.get_account(bond).unwrap();
    f(&harbor::MerchantBond::try_deserialize(&mut acc.data.as_slice()).unwrap())
}

#[allow(clippy::too_many_arguments)]
fn submit(
    svm: &mut LiteSVM,
    s: &Setup,
    signer: &Keypair,
    nonce: u64,
    expiry_slot: u64,
) -> Result<(), String> {
    let meter_hash = [1u8; 32];
    let output_hash = [2u8; 32];
    let msg = harbor::receipt_message_bytes(
        &s.merchant.pubkey(),
        &s.binding,
        10_000,
        &meter_hash,
        &output_hash,
        0,
        nonce,
        expiry_slot,
        &s.merchant.pubkey(),
    );
    let ix_sysvar: Pubkey = "Sysvar1nstructions1111111111111111111111111"
        .parse()
        .unwrap();
    send(
        svm,
        &s.merchant,
        vec![
            ed25519_ix(signer, &msg),
            Instruction::new_with_bytes(
                harbor::id(),
                &harbor::instruction::SubmitReceipt {
                    cumulative_spend: 10_000,
                    meter_hash,
                    output_hash,
                    status: 0,
                    nonce,
                    expiry_slot,
                    signer: s.merchant.pubkey(),
                }
                .data(),
                harbor::accounts::SubmitReceipt {
                    merchant: s.merchant.pubkey(),
                    bond: s.bond,
                    binding: s.binding,
                    receipt: receipt_pda(&s.binding, nonce),
                    ix_sysvar,
                    system_program: system_program::ID,
                }
                .to_account_metas(None),
            ),
        ],
    )
}

#[test]
fn test_receipt_proofs() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let far_future = svm.get_sysvar::<Clock>().slot + 10_000;

    // Valid receipt lands.
    submit(&mut svm, &s, &s.merchant, 1, far_future).unwrap();
    let acc = svm
        .get_account(&receipt_pda(&s.binding, 1))
        .unwrap();
    let log = harbor::ReceiptLog::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(log.nonce, 1);
    assert_eq!(log.cumulative_spend, 10_000);

    // Replay of the same nonce fails.
    assert!(submit(&mut svm, &s, &s.merchant, 1, far_future).is_err());

    // Wrong signer fails.
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    assert!(submit(&mut svm, &s, &stranger, 2, far_future).is_err());

    // Expired receipt fails.
    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 50);
    let past = svm.get_sysvar::<Clock>().slot - 1;
    assert!(submit(&mut svm, &s, &s.merchant, 2, past).is_err());
}

#[test]
fn test_timeout_refund_slash() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Claim with no delivery behind it: claimant locks the claim size.
    open(&mut svm, &s, 2, 1, 10_000).unwrap();
    assert_eq!(token_balance(&svm, &s.claimant_ata), 90_000);
    assert_eq!(token_balance(&svm, &s.vault), 510_000);

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);

    // Resolution is permissionless: any funded keypair can fire it.
    let keeper = Keypair::new();
    svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    resolve(&mut svm, &s, 2, &keeper).unwrap();

    // Refund math: fee = 10_000 * 500 / 10_000 = 500; refund = 9_500;
    // penalty = 20_000 to treasury. Only the penalty hits the bond.
    assert_eq!(token_balance(&svm, &s.claimant_ata), 100_000 - 500);
    let treasury = treasury_of(&s.mint);
    assert_eq!(
        token_balance(&svm, &treasury_ata_of(&treasury, &s.mint, &s.token_program)),
        20_500
    );
    assert_eq!(token_balance(&svm, &s.vault), 480_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.amount), 480_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.reserved), 0);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.open_disputes), 0);
    assert!(svm.get_account(&dispute_pda(&s.binding, 2)).is_none());
}

#[test]
fn test_proactive_junk_receipt_irrelevant() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let far_future = svm.get_sysvar::<Clock>().slot + 100_000;

    // The merchant proactively "delivers" the failed request with a
    // validly-signed junk receipt before any dispute exists.
    submit(&mut svm, &s, &s.merchant, 3, far_future).unwrap();

    // The dispute opens anyway: receipts are not evidence.
    open(&mut svm, &s, 3, 1, 5_000).unwrap();

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    resolve(&mut svm, &s, 3, &s.claimant).unwrap();

    // Claim still pays out; the junk receipt still sits onchain, ignored.
    assert_eq!(token_balance(&svm, &s.claimant_ata), 100_000 - 250);
    assert!(svm.get_account(&receipt_pda(&s.binding, 3)).is_some());
}

#[test]
fn test_reserve_gating_and_full_close() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Two concurrent claims reserve their full outflow.
    open(&mut svm, &s, 3, 1, 2_000).unwrap(); // reserves 6_000
    open(&mut svm, &s, 4, 2, 3_000).unwrap(); // reserves 9_000
    assert_eq!(bond_field(&svm, &s.bond, |b| b.reserved), 15_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.open_disputes), 2);

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);

    // Withdrawals may only touch the unreserved remainder.
    assert!(withdraw(&mut svm, &s, 486_000).is_err());
    withdraw(&mut svm, &s, 485_000).unwrap();
    assert_eq!(bond_field(&svm, &s.bond, |b| b.amount), 15_000);

    // Resolving releases the reserve stepwise (only the penalty hit the
    // bond: 2_000 claim -> penalty 4_000).
    resolve(&mut svm, &s, 3, &s.claimant).unwrap();
    assert_eq!(bond_field(&svm, &s.bond, |b| b.amount), 11_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.reserved), 9_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.open_disputes), 1);

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    assert!(withdraw(&mut svm, &s, 2_001).is_err());
    withdraw(&mut svm, &s, 2_000).unwrap();
    assert_eq!(bond_field(&svm, &s.bond, |b| b.amount), 9_000);

    // Last resolve clears the reserve; the bond can be fully drained.
    resolve(&mut svm, &s, 4, &s.claimant).unwrap();
    assert_eq!(bond_field(&svm, &s.bond, |b| b.amount), 3_000);
    assert_eq!(bond_field(&svm, &s.bond, |b| b.reserved), 0);

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    withdraw(&mut svm, &s, 3_000).unwrap();
    assert_eq!(token_balance(&svm, &s.vault), 0);

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::RefundUnused {}.data(),
            harbor::accounts::RefundUnused {
                merchant: s.merchant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                vault: s.vault,
                merchant_ata: s.merchant_ata,
                token_program: s.token_program,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert!(svm.get_account(&s.bond).is_none());
    assert!(svm.get_account(&s.vault).is_none());
}

#[test]
fn test_halt_then_dispute_succeeds() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let far_future = svm.get_sysvar::<Clock>().slot + 100_000;

    // Stranger cannot halt the merchant's binding.
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let hostile = send(
        &mut svm,
        &stranger,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::HaltBinding {}.data(),
            harbor::accounts::HaltBinding {
                merchant: stranger.pubkey(),
                binding: s.binding,
            }
            .to_account_metas(None),
        )],
    );
    assert!(hostile.is_err());

    // Merchant halts: receipts freeze...
    send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::HaltBinding {}.data(),
            harbor::accounts::HaltBinding {
                merchant: s.merchant.pubkey(),
                binding: s.binding,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert!(submit(&mut svm, &s, &s.merchant, 1, far_future).is_err());

    // ...but disputes are NEVER blocked by halt: no halt-shaped rug.
    open(&mut svm, &s, 1, 1, 4_000).unwrap();

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    resolve(&mut svm, &s, 1, &s.claimant).unwrap();
    assert_eq!(token_balance(&svm, &s.claimant_ata), 100_000 - 200);
}

#[test]
fn test_fabrication_rejected() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Claim above the merchant-declared max_spend is rejected outright.
    assert!(open(&mut svm, &s, 5, 1, 250_001).is_err());
    // Zero claims are rejected.
    assert!(open(&mut svm, &s, 5, 1, 0).is_err());
    // Claims the claimant cannot fund are rejected by the transfer.
    assert!(open(&mut svm, &s, 5, 1, 250_000).is_err());
    // Failed opens leave no dispute account behind (init rolled back).
    assert!(svm.get_account(&dispute_pda(&s.binding, 5)).is_none());
}

fn treasury_withdraw(
    svm: &mut LiteSVM,
    s: &Setup,
    signer: &Keypair,
    amount: u64,
) -> Result<(), String> {
    let bpf_loader: Pubkey = "BPFLoaderUpgradeab1e11111111111111111111111"
        .parse()
        .unwrap();
    let (programdata, _) = Pubkey::find_program_address(&[harbor::id().as_ref()], &bpf_loader);
    let treasury = treasury_of(&s.mint);
    send(
        svm,
        signer,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::WithdrawTreasury { amount }.data(),
            harbor::accounts::WithdrawTreasury {
                authority: signer.pubkey(),
                programdata,
                treasury,
                treasury_ata: treasury_ata_of(&treasury, &s.mint, &s.token_program),
                destination_ata: s.merchant_ata,
                mint: s.mint,
                token_program: s.token_program,
            }
            .to_account_metas(None),
        )],
    )
}

#[test]
fn test_treasury_withdraw_governed() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Fund the treasury via a normal claim resolve (fee 500 + penalty 20_000).
    open(&mut svm, &s, 12, 1, 10_000).unwrap();
    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    resolve(&mut svm, &s, 12, &s.claimant).unwrap();
    let treasury = treasury_of(&s.mint);
    let t_ata = treasury_ata_of(&treasury, &s.mint, &s.token_program);
    assert_eq!(token_balance(&svm, &t_ata), 20_500);

    // Craft the programdata account naming `authority` as the upgrader.
    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 1_000_000_000).unwrap();
    let bpf_loader: Pubkey = "BPFLoaderUpgradeab1e11111111111111111111111"
        .parse()
        .unwrap();
    let (programdata, _) = Pubkey::find_program_address(&[harbor::id().as_ref()], &bpf_loader);
    svm.airdrop(&programdata, 10_000_000).unwrap();
    let mut pd = svm.get_account(&programdata).unwrap();
    let mut bytes = vec![3u8, 0, 0, 0];
    bytes.extend_from_slice(&0u64.to_le_bytes());
    bytes.push(1u8);
    bytes.extend_from_slice(authority.pubkey().as_ref());
    pd.data = bytes;
    pd.owner = bpf_loader;
    svm.set_account(programdata, pd).unwrap();

    // Stranger cannot move treasury funds.
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    assert!(treasury_withdraw(&mut svm, &s, &stranger, 20_500).is_err());

    // The upgrade authority drains to the destination ATA in full.
    treasury_withdraw(&mut svm, &s, &authority, 20_500).unwrap();
    assert_eq!(token_balance(&svm, &t_ata), 0);
    assert_eq!(token_balance(&svm, &s.merchant_ata), 500_000 + 20_500);
}

#[test]
fn test_oversized_claim_errors_never_panics() {
    // A whale-sized claim (unreachable via open_dispute, which requires
    // funding the lock) must fail resolve with ArithmeticOverflow — not
    // panic, not move funds, not brick anything reachable.
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Harvest the real Dispute discriminator from an honest dispute.
    open(&mut svm, &s, 30, 1, 1_000).unwrap();
    let real = svm.get_account(&dispute_pda(&s.binding, 30)).unwrap();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&real.data[0..8]);

    // Craft the oversized dispute directly: deadline 0 (mature),
    // claim u64::MAX, canonical bump so seeds verify.
    let dpda = dispute_pda(&s.binding, 31);
    svm.airdrop(&dpda, 10_000_000).unwrap();
    let mut acc = svm.get_account(&dpda).unwrap();
    let mut data = vec![0u8; 8 + 32 + 8 + 1 + 32 + 8 + 8 + 8 + 1];
    data[0..8].copy_from_slice(&disc);
    data[8..40].copy_from_slice(s.binding.as_ref());
    data[40..48].copy_from_slice(&31u64.to_le_bytes());
    data[48] = 1;
    data[49..81].copy_from_slice(s.claimant.pubkey().as_ref());
    data[81..89].copy_from_slice(&0u64.to_le_bytes());
    data[89..97].copy_from_slice(&10_000_000u64.to_le_bytes());
    data[97..105].copy_from_slice(&u64::MAX.to_le_bytes());
    let (_, bump) = Pubkey::find_program_address(
        &[b"dispute", s.binding.as_ref(), &31u64.to_le_bytes()],
        &harbor::id(),
    );
    data[105] = bump;
    acc.data = data;
    acc.owner = harbor::id();
    svm.set_account(dpda, acc).unwrap();

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    let vault_before = token_balance(&svm, &s.vault);
    let r = resolve(&mut svm, &s, 31, &s.claimant);
    assert!(r.is_err());
    assert!(
        r.unwrap_err().contains("ArithmeticOverflow"),
        "whale claim must error, never panic"
    );
    assert_eq!(token_balance(&svm, &s.vault), vault_before);
}
