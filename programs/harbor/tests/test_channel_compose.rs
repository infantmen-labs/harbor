use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::{AccountMeta, Instruction},
        system_program, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo, TOKEN_ID},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const CHANNEL_PROGRAM_ID: &str = "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX";
const DEPOSIT: u64 = 5_000_000;
const SALT: u64 = 42;

fn a2p<T: AsRef<[u8]>>(a: &T) -> Pubkey {
    Pubkey::new_from_array(a.as_ref().try_into().unwrap())
}

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let acc = svm.get_account(ata).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn meta(key: Pubkey, writable: bool, signer: bool) -> AccountMeta {
    if writable {
        AccountMeta::new(key, signer)
    } else {
        AccountMeta::new_readonly(key, signer)
    }
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

#[test]
fn test_channel_compose() {
    let chnl: Pubkey = CHANNEL_PROGRAM_ID.parse().unwrap();
    let mut svm = LiteSVM::new();
    svm.add_program(chnl, include_bytes!("fixtures/payment_channels.so"))
        .unwrap();
    svm.add_program(
        harbor::id(),
        include_bytes!("../../../target/deploy/harbor.so"),
    )
    .unwrap();

    let payer = Keypair::new();
    let auth_signer = Keypair::new();
    let merchant = Keypair::new();
    let claimant = Keypair::new();
    for k in [&payer, &merchant, &claimant] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    // LiteSVM 0.10 enforces rent on loaded accounts: fund readonly actors too.
    // The harbor merchant IS the channel payee (bind requires payee == merchant).
    svm.airdrop(&auth_signer.pubkey(), 10_000_000).unwrap();

    let mint_addr = CreateMint::new(&mut svm, &payer)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();

    let payer_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &payer, &mint_addr)
        .send()
        .unwrap();
    let payer_ata = a2p(&payer_ata_addr);
    MintTo::new(
        &mut svm,
        &payer,
        &mint_addr,
        &payer_ata_addr,
        DEPOSIT + 100_000,
    )
    .send()
    .unwrap();
    let merchant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
        .send()
        .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(&mut svm, &payer, &mint_addr, &merchant_ata_addr, 1_000_000)
        .send()
        .unwrap();
    let claimant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &claimant, &mint_addr)
        .send()
        .unwrap();
    let _claimant_ata = a2p(&claimant_ata_addr);
    MintTo::new(&mut svm, &payer, &mint_addr, &claimant_ata_addr, 100_000)
        .send()
        .unwrap();

    // --- upstream open (discriminator 1, zero recipients) ---
    let (channel, _) = Pubkey::find_program_address(
        &[
            b"channel",
            payer.pubkey().as_ref(),
            merchant.pubkey().as_ref(),
            mint.as_ref(),
            auth_signer.pubkey().as_ref(),
            &SALT.to_le_bytes(),
            &0u64.to_le_bytes(),
        ],
        &chnl,
    );
    let (channel_ata, _) = Pubkey::find_program_address(
        &[channel.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    let (event_authority, _) = Pubkey::find_program_address(&[b"event_authority"], &chnl);
    let rent_sysvar: Pubkey = "SysvarRent111111111111111111111111111111111"
        .parse()
        .unwrap();

    let mut open_data = vec![1u8];
    open_data.extend_from_slice(&SALT.to_le_bytes());
    open_data.extend_from_slice(&DEPOSIT.to_le_bytes());
    open_data.extend_from_slice(&7200u32.to_le_bytes());
    open_data.extend_from_slice(&0u64.to_le_bytes());
    open_data.extend_from_slice(&0u32.to_le_bytes());
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![
                meta(payer.pubkey(), true, true),
                meta(payer.pubkey(), true, true),
                meta(merchant.pubkey(), false, false),
                meta(mint, false, false),
                meta(auth_signer.pubkey(), false, false),
                meta(channel, true, false),
                meta(payer_ata, true, false),
                meta(channel_ata, true, false),
                meta(token_program, false, false),
                meta(system_program::ID, false, false),
                meta(rent_sysvar, false, false),
                meta(ata_program, false, false),
                meta(event_authority, false, false),
                meta(chnl, false, false),
            ],
            data: open_data,
        }],
    )
    .unwrap();

    // Channel exists, owned by the upstream program, escrow funded.
    assert_eq!(a2p(&svm.get_account(&channel).unwrap().owner), chnl);
    assert_eq!(token_balance(&svm, &channel_ata), DEPOSIT);

    // --- upstream settle advances the watermark, moves no funds ---
    let mut payload = vec![0x56u8, 0x01];
    payload.extend_from_slice(channel.as_ref());
    payload.extend_from_slice(&2_000_000u64.to_le_bytes());
    payload.extend_from_slice(&0i64.to_le_bytes());
    let ix_sysvar: Pubkey = "Sysvar1nstructions1111111111111111111111111"
        .parse()
        .unwrap();
    send(
        &mut svm,
        &payer,
        vec![
            ed25519_ix(&auth_signer, &payload),
            Instruction {
                program_id: chnl,
                accounts: vec![meta(channel, true, false), meta(ix_sysvar, false, false)],
                data: vec![2u8],
            },
        ],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &channel_ata), DEPOSIT);

    // --- Harbor binds the real channel (ownership gate passes) ---
    let bond = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), mint.as_ref()],
        &harbor::id(),
    )
    .0;
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
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
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::PostBond { amount: 500_000 }.data(),
            harbor::accounts::PostBond {
                merchant: merchant.pubkey(),
                bond,
                mint,
                merchant_ata,
                vault: Pubkey::find_program_address(
                    &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
                    &ata_program,
                )
                .0,
                token_program,
                associated_token_program: ata_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    let vault = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0;
    let (binding, _) = Pubkey::find_program_address(&[b"binding", channel.as_ref()], &harbor::id());

    // Negative: wrong channel program is rejected (seeds match, owner check fires).
    let (binding2, _) =
        Pubkey::find_program_address(&[b"binding", merchant_ata.as_ref()], &harbor::id());
    let bad_bind = send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::BindChannel {
                channel_program: system_program::ID,
                max_spend: 250_000,
            }
            .data(),
            harbor::accounts::BindChannel {
                merchant: merchant.pubkey(),
                bond,
                binding: binding2,
                channel: merchant_ata,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    );
    assert!(bad_bind.is_err());

    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::BindChannel {
                channel_program: chnl,
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

    // --- Harbor timeout refund; upstream escrow must be untouched ---
    let dispute = Pubkey::find_program_address(
        &[b"dispute", binding.as_ref(), &9u64.to_le_bytes()],
        &harbor::id(),
    )
    .0;
    send(
        &mut svm,
        &payer,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute {
                nonce: 9,
                reason: 1,
                claim_spend: 10_000,
            }
            .data(),
            harbor::accounts::OpenDispute {
                // Only the channel's buyer may claim: the upstream payer
                // (the agent) disputes its own purchase here.
                claimant: payer.pubkey(),
                bond,
                binding,
                channel,
                dispute,
                claim: Pubkey::find_program_address(
                    &[b"claim", binding.as_ref(), &9u64.to_le_bytes()],
                    &harbor::id(),
                )
                .0,
                mint,
                claimant_ata: payer_ata,
                vault,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    svm.warp_to_slot(
        svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>()
            .slot
            + 500,
    );
    let treasury = Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id()).0;
    let treasury_ata = Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0;
    send(
        &mut svm,
        &claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce: 9 }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: claimant.pubkey(),
                bond,
                mint,
                binding,
                dispute,
                claimant: payer.pubkey(),
                treasury,
                vault,
                treasury_ata,
                claimant_ata: payer_ata,
                associated_token_program: ata_program,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    // Refund math: fee = 10_000 * 500 / 10_000 = 500; refund = 9_500;
    // penalty = 20_000. Vault out 30_000 total, bond down 20_500.
    // The buyer (upstream payer) locks the claim and gets it back minus
    // the fee: 100_000 held after the channel open − 500 net.
    assert_eq!(token_balance(&svm, &payer_ata), 100_000 - 500);
    assert_eq!(token_balance(&svm, &treasury_ata), 20_500);
    assert_eq!(token_balance(&svm, &vault), 500_000 + 10_000 - 30_000);
    // Upstream escrow intact: no double-pay across the disjoint pools.
    assert_eq!(token_balance(&svm, &channel_ata), DEPOSIT);
}

/// The escrow-leg rebuttal, encoded as a test.
///
/// A buyer who RECEIVED service disputing anyway is the strongest form
/// of the "dishonest buyer profits" claim. Full accounting, with the
/// upstream escrow the merchant settles unilaterally:
///   buyer outlay  = S (escrow, unrecoverable once merchant settles)
///                 + S (locked claim)
///   buyer income  = 0.95 * S (refund)
///   buyer net     = -1.05 * S  →  always ≥105% of the service value.
/// There is no profitable dishonest-buyer strategy at any scale; the
/// residual is spite-burn (destroy ≥5% of your own capital to burn 2x
/// of the merchant's), which is bounded and unprofitable.
#[test]
fn test_dishonest_buyer_nets_negative() {
    let chnl: Pubkey = CHANNEL_PROGRAM_ID.parse().unwrap();
    let mut svm = LiteSVM::new();
    svm.add_program(chnl, include_bytes!("fixtures/payment_channels.so"))
        .unwrap();
    svm.add_program(
        harbor::id(),
        include_bytes!("../../../target/deploy/harbor.so"),
    )
    .unwrap();

    let payer = Keypair::new();
    let auth_signer = Keypair::new();
    let merchant = Keypair::new();
    let resolver = Keypair::new();
    for k in [&payer, &merchant, &resolver] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    svm.airdrop(&auth_signer.pubkey(), 10_000_000).unwrap();

    let mint_addr = CreateMint::new(&mut svm, &payer)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();

    // Buyer holds DEPOSIT (escrowed on open) plus SPARE for the claim lock.
    const SPARE: u64 = 50_000;
    const CLAIM: u64 = 10_000;
    const FEE: u64 = 500; // CLAIM * 500 / 10_000
    const PENALTY: u64 = 20_000; // CLAIM * 2
    let payer_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &payer, &mint_addr)
        .send()
        .unwrap();
    let payer_ata = a2p(&payer_ata_addr);
    MintTo::new(
        &mut svm,
        &payer,
        &mint_addr,
        &payer_ata_addr,
        DEPOSIT + SPARE,
    )
    .send()
    .unwrap();
    let merchant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
        .send()
        .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(&mut svm, &payer, &mint_addr, &merchant_ata_addr, 1_000_000)
        .send()
        .unwrap();

    // Real upstream channel: payer (buyer) escrows DEPOSIT, payee is the
    // merchant — the exact production shape the bind check requires.
    let (channel, _) = Pubkey::find_program_address(
        &[
            b"channel",
            payer.pubkey().as_ref(),
            merchant.pubkey().as_ref(),
            mint.as_ref(),
            auth_signer.pubkey().as_ref(),
            &7u64.to_le_bytes(),
            &0u64.to_le_bytes(),
        ],
        &chnl,
    );
    let (channel_ata, _) = Pubkey::find_program_address(
        &[channel.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    let (event_authority, _) = Pubkey::find_program_address(&[b"event_authority"], &chnl);
    let rent_sysvar: Pubkey = "SysvarRent111111111111111111111111111111111"
        .parse()
        .unwrap();
    let mut open_data = vec![1u8];
    open_data.extend_from_slice(&7u64.to_le_bytes());
    open_data.extend_from_slice(&DEPOSIT.to_le_bytes());
    open_data.extend_from_slice(&7200u32.to_le_bytes());
    open_data.extend_from_slice(&0u64.to_le_bytes());
    open_data.extend_from_slice(&0u32.to_le_bytes());
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![
                meta(payer.pubkey(), true, true),
                meta(payer.pubkey(), true, true),
                meta(merchant.pubkey(), false, false),
                meta(mint, false, false),
                meta(auth_signer.pubkey(), false, false),
                meta(channel, true, false),
                meta(payer_ata, true, false),
                meta(channel_ata, true, false),
                meta(token_program, false, false),
                meta(system_program::ID, false, false),
                meta(rent_sysvar, false, false),
                meta(ata_program, false, false),
                meta(event_authority, false, false),
                meta(chnl, false, false),
            ],
            data: open_data,
        }],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &payer_ata), SPARE);

    // Harbor bond + bind (payee check passes: merchant is the payee).
    let bond = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), mint.as_ref()],
        &harbor::id(),
    )
    .0;
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
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
    let vault = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0;
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
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
    let (binding, _) = Pubkey::find_program_address(&[b"binding", channel.as_ref()], &harbor::id());
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::BindChannel {
                channel_program: chnl,
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

    // The buyer RECEIVED service (escrow is the merchant's to settle),
    // then disputes anyway with a fully-funded claim.
    let dispute = Pubkey::find_program_address(
        &[b"dispute", binding.as_ref(), &1u64.to_le_bytes()],
        &harbor::id(),
    )
    .0;
    send(
        &mut svm,
        &payer,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute {
                nonce: 1,
                reason: 1,
                claim_spend: CLAIM,
            }
            .data(),
            harbor::accounts::OpenDispute {
                claimant: payer.pubkey(),
                bond,
                binding,
                channel,
                dispute,
                claim: Pubkey::find_program_address(
                    &[b"claim", binding.as_ref(), &1u64.to_le_bytes()],
                    &harbor::id(),
                )
                .0,
                mint,
                claimant_ata: payer_ata,
                vault,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    svm.warp_to_slot(
        svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>()
            .slot
            + 500,
    );
    let treasury = Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id()).0;
    let treasury_ata = Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0;
    send(
        &mut svm,
        &resolver,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce: 1 }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: resolver.pubkey(),
                bond,
                mint,
                binding,
                dispute,
                claimant: payer.pubkey(),
                treasury,
                vault,
                treasury_ata,
                claimant_ata: payer_ata,
                associated_token_program: ata_program,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    // THE THEOREM: dishonest buyer nets exactly -FEE on the claim leg,
    // on top of the unrecoverable escrow payment. No profit at any scale.
    assert_eq!(token_balance(&svm, &payer_ata), SPARE - FEE);
    // Escrow untouched by Harbor paths (merchant settles it separately).
    assert_eq!(token_balance(&svm, &channel_ata), DEPOSIT);
    // Merchant punished as designed; treasury accumulates fee + penalty.
    assert_eq!(
        token_balance(&svm, &vault),
        500_000 + CLAIM - (CLAIM - FEE) - FEE - PENALTY
    );
    assert_eq!(token_balance(&svm, &treasury_ata), FEE + PENALTY);
}

/// Adversarial settle, codified (audit F-1): the merchant settles a
/// buyer-signed voucher for service NEVER rendered, then distributes —
/// capturing the escrow leg — while the buyer's Harbor dispute still
/// resolves per math on the SEPARATE bond pool. Asserted end state:
/// merchant +(settled), buyer net -(escrow) - 0.05*claim, bond -2x,
/// treasury +(fee + 2x). This is the disclosed mechanism; the test
/// exists so no future change can silently alter either leg.
#[test]
fn test_adversarial_settle_then_dispute() {
    let chnl: Pubkey = CHANNEL_PROGRAM_ID.parse().unwrap();
    let mut svm = LiteSVM::new();
    svm.add_program(chnl, include_bytes!("fixtures/payment_channels.so"))
        .unwrap();
    svm.add_program(
        harbor::id(),
        include_bytes!("../../../target/deploy/harbor.so"),
    )
    .unwrap();

    const ESCROW: u64 = 200_000;
    const CLAIM: u64 = 20_000;
    const FEE: u64 = 1_000; // CLAIM * 500 / 10_000
    const PENALTY: u64 = 40_000; // CLAIM * 2
    const SETTLED: u64 = 150_000;

    let payer = Keypair::new();
    let auth_signer = Keypair::new();
    let merchant = Keypair::new();
    let resolver = Keypair::new();
    for k in [&payer, &merchant, &resolver] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    svm.airdrop(&auth_signer.pubkey(), 10_000_000).unwrap();

    let mint_addr = CreateMint::new(&mut svm, &payer)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();

    // Buyer holds escrow + claim stake; merchant starts funded.
    let payer_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &payer, &mint_addr)
        .send()
        .unwrap();
    let payer_ata = a2p(&payer_ata_addr);
    MintTo::new(
        &mut svm,
        &payer,
        &mint_addr,
        &payer_ata_addr,
        ESCROW + CLAIM + 100_000,
    )
    .send()
    .unwrap();
    let merchant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
        .send()
        .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    let payer_start = token_balance(&svm, &payer_ata);

    // Harbor bond 500_000 (covers 3x reserve 60_000).
    let bond = Pubkey::find_program_address(
        &[b"bond", merchant.pubkey().as_ref(), mint.as_ref()],
        &harbor::id(),
    )
    .0;
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
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
    MintTo::new(&mut svm, &payer, &mint_addr, &merchant_ata_addr, 500_000)
        .send()
        .unwrap();
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
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
    let merchant_posted = token_balance(&svm, &merchant_ata);

    // Upstream open with SHORT grace (50s). Seal's gate compares unix
    // seconds, which slot warps don't advance — the test time-travels
    // the Clock sysvar directly instead (deterministic, no guessing).
    let (channel, _) = Pubkey::find_program_address(
        &[
            b"channel",
            payer.pubkey().as_ref(),
            merchant.pubkey().as_ref(),
            mint.as_ref(),
            auth_signer.pubkey().as_ref(),
            &SALT.to_le_bytes(),
            &0u64.to_le_bytes(),
        ],
        &chnl,
    );
    let (channel_ata, _) = Pubkey::find_program_address(
        &[channel.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    let (event_authority, _) = Pubkey::find_program_address(&[b"event_authority"], &chnl);
    let rent_sysvar: Pubkey = "SysvarRent111111111111111111111111111111111"
        .parse()
        .unwrap();
    let mut open_data = vec![1u8];
    open_data.extend_from_slice(&SALT.to_le_bytes());
    open_data.extend_from_slice(&ESCROW.to_le_bytes());
    open_data.extend_from_slice(&50u32.to_le_bytes());
    open_data.extend_from_slice(&0u64.to_le_bytes());
    open_data.extend_from_slice(&0u32.to_le_bytes());
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![
                meta(payer.pubkey(), true, true),
                meta(payer.pubkey(), true, true),
                meta(merchant.pubkey(), false, false),
                meta(mint, false, false),
                meta(auth_signer.pubkey(), false, false),
                meta(channel, true, false),
                meta(payer_ata, true, false),
                meta(channel_ata, true, false),
                meta(token_program, false, false),
                meta(system_program::ID, false, false),
                meta(rent_sysvar, false, false),
                meta(ata_program, false, false),
                meta(event_authority, false, false),
                meta(chnl, false, false),
            ],
            data: open_data,
        }],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &channel_ata), ESCROW);

    // Harbor bind (payee == merchant).
    let (binding, _) = Pubkey::find_program_address(&[b"binding", channel.as_ref()], &harbor::id());
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::BindChannel {
                channel_program: chnl,
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

    // ADVERSARIAL LEG: buyer-signed voucher, NO service rendered, merchant
    // settles it anyway (settle is permissionless on a valid voucher).
    let mut payload = vec![0x56u8, 0x01];
    payload.extend_from_slice(channel.as_ref());
    payload.extend_from_slice(&SETTLED.to_le_bytes());
    payload.extend_from_slice(&0i64.to_le_bytes());
    let ix_sysvar: Pubkey = "Sysvar1nstructions1111111111111111111111111"
        .parse()
        .unwrap();
    send(
        &mut svm,
        &merchant,
        vec![
            ed25519_ix(&auth_signer, &payload),
            Instruction {
                program_id: chnl,
                accounts: vec![meta(channel, true, false), meta(ix_sysvar, false, false)],
                data: vec![2u8],
            },
        ],
    )
    .unwrap();
    // Watermark advanced anyway; escrow untouched (capture needs distribute).
    let ch = svm.get_account(&channel).unwrap();
    assert_eq!(
        u64::from_le_bytes(ch.data[20..28].try_into().unwrap()),
        SETTLED
    );
    assert_eq!(token_balance(&svm, &channel_ata), ESCROW);

    // BOND LEG: payer disputes the failed nonce; resolves per math.
    let (dispute, _) = Pubkey::find_program_address(
        &[b"dispute", binding.as_ref(), &1u64.to_le_bytes()],
        &harbor::id(),
    );
    let (claim, _) = Pubkey::find_program_address(
        &[b"claim", binding.as_ref(), &1u64.to_le_bytes()],
        &harbor::id(),
    );
    send(
        &mut svm,
        &payer,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute {
                nonce: 1,
                reason: 1,
                claim_spend: CLAIM,
            }
            .data(),
            harbor::accounts::OpenDispute {
                claimant: payer.pubkey(),
                bond,
                binding,
                channel,
                dispute,
                claim,
                mint,
                claimant_ata: payer_ata,
                vault,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    svm.warp_to_slot(
        svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>()
            .slot
            + 500,
    );
    let treasury = Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id()).0;
    let treasury_ata = Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    )
    .0;
    send(
        &mut svm,
        &resolver,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce: 1 }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: resolver.pubkey(),
                bond,
                mint,
                binding,
                dispute,
                claimant: payer.pubkey(),
                treasury,
                vault,
                treasury_ata,
                claimant_ata: payer_ata,
                associated_token_program: ata_program,
                token_program,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    // Bond leg exact: refund 95%, penalty 2x.
    assert_eq!(
        token_balance(&svm, &payer_ata),
        payer_start - ESCROW - CLAIM + (CLAIM - FEE)
    );
    let (treasury, _) = Pubkey::find_program_address(&[b"treasury", mint.as_ref()], &harbor::id());
    let (treasury_ata, _) = Pubkey::find_program_address(
        &[treasury.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    assert_eq!(token_balance(&svm, &treasury_ata), FEE + PENALTY);

    // CAPTURE LEG: merchant force-closes and distributes the escrow it
    // already settled — the funds the bond never covered.
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![
                meta(payer.pubkey(), false, true),
                meta(channel, true, false),
            ],
            data: vec![5u8],
        }],
    )
    .unwrap();
    // Seal past the 50s grace by time-traveling the Clock sysvar.
    let mut clock = svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>();
    clock.unix_timestamp += 3_600;
    svm.set_sysvar(&clock);
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![meta(channel, true, false)],
            data: vec![6u8],
        }],
    )
    .unwrap();
    assert_eq!(svm.get_account(&channel).unwrap().data[3], 1);
    // Treasury ATA for the fixture sentinel owner (default localnet build).
    // Created explicitly: distribute validates the canonical ATA, which
    // starts uninitialized on a fresh ledger.
    let sentinel = Pubkey::new_from_array([
        0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE,
        0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF, 0xBE, 0xEF,
        0xBE, 0xEF,
    ]);
    let (treasury_upstream_ata, _) = Pubkey::find_program_address(
        &[sentinel.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    send(
        &mut svm,
        &payer,
        vec![Instruction {
            program_id: ata_program,
            accounts: vec![
                meta(payer.pubkey(), true, true),
                meta(treasury_upstream_ata, true, false),
                meta(sentinel, false, false),
                meta(mint, false, false),
                meta(system_program::ID, false, false),
                meta(token_program, false, false),
            ],
            data: vec![],
        }],
    )
    .unwrap();
    let rent_payer = {
        let chx = svm.get_account(&channel).unwrap();
        Pubkey::new_from_array(chx.data[216..248].try_into().unwrap())
    };
    send(
        &mut svm,
        &merchant,
        vec![Instruction {
            program_id: chnl,
            accounts: vec![
                meta(channel, true, false),
                meta(payer.pubkey(), false, false),
                meta(rent_payer, true, false),
                meta(channel_ata, true, false),
                meta(payer_ata, true, false),
                meta(merchant_ata, true, false),
                meta(treasury_upstream_ata, true, false),
                meta(mint, false, false),
                meta(token_program, false, false),
                meta(event_authority, false, false),
                meta(chnl, false, false),
            ],
            data: vec![7u8, 0, 0, 0, 0],
        }],
    )
    .unwrap();
    // Escrow captured by the merchant; payer got only the bond remedy.
    assert_eq!(
        token_balance(&svm, &merchant_ata) - merchant_posted,
        SETTLED
    );
    assert_eq!(
        token_balance(&svm, &payer_ata),
        payer_start - ESCROW - CLAIM + (CLAIM - FEE) + (ESCROW - SETTLED)
    );
}
