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

    let channel = Keypair::new().pubkey();
    let (binding, _) =
        Pubkey::find_program_address(&[b"binding", channel.as_ref()], &program_id);
    send(
        svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::BindChannel {
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

fn dispute_pda(binding: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"dispute", binding.as_ref(), &nonce.to_le_bytes()],
        &harbor::id(),
    )
    .0
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
fn test_timeout_slash() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);

    // Dispute with no delivery behind it.
    send(
        &mut svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute { nonce: 2, reason: 1 }.data(),
            harbor::accounts::OpenDispute {
                claimant: s.claimant.pubkey(),
                bond: s.bond,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 2),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    // Slash math: min(500_000, 250_000 * 50 / 10_000) = 1_250.
    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    send(
        &mut svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveTimeout { nonce: 2 }.data(),
            harbor::accounts::ResolveTimeout {
                resolver: s.claimant.pubkey(),
                bond: s.bond,
                mint: s.mint,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 2),
                claimant: s.claimant.pubkey(),
                receipt: receipt_pda(&s.binding, 2),
                vault: s.vault,
                claimant_ata: s.claimant_ata,
                token_program: s.token_program,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    assert_eq!(token_balance(&svm, &s.claimant_ata), 1_250);
    assert_eq!(token_balance(&svm, &s.vault), 500_000 - 1_250);
    assert!(svm.get_account(&dispute_pda(&s.binding, 2)).is_none());
}

#[test]
fn test_delivered_wins_and_full_close() {
    let mut svm = LiteSVM::new();
    let s = setup(&mut svm);
    let far_future = svm.get_sysvar::<Clock>().slot + 100_000;

    // Deliver first.
    submit(&mut svm, &s, &s.merchant, 3, far_future).unwrap();

    // Hostile dispute over delivered work.
    send(
        &mut svm,
        &s.claimant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::OpenDispute { nonce: 3, reason: 2 }.data(),
            harbor::accounts::OpenDispute {
                claimant: s.claimant.pubkey(),
                bond: s.bond,
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 3),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();

    // Withdraw is blocked while the dispute is open.
    let blocked = send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::WithdrawBond { amount: 1_000 }.data(),
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
    );
    assert!(blocked.is_err());

    // Delivery proof wins: stake goes to the merchant, no slash.
    let merchant_before = lamports(&svm, &s.merchant.pubkey());
    let dispute_lamports = lamports(&svm, &dispute_pda(&s.binding, 3));
    let resolver = Keypair::new();
    svm.airdrop(&resolver.pubkey(), 1_000_000_000).unwrap();
    send(
        &mut svm,
        &resolver,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::ResolveDelivered { nonce: 3 }.data(),
            harbor::accounts::ResolveDelivered {
                resolver: resolver.pubkey(),
                bond: s.bond,
                merchant: s.merchant.pubkey(),
                binding: s.binding,
                dispute: dispute_pda(&s.binding, 3),
                receipt: receipt_pda(&s.binding, 3),
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &s.vault), 500_000);
    assert_eq!(
        lamports(&svm, &s.merchant.pubkey()) - merchant_before,
        dispute_lamports
    );
    assert!(svm.get_account(&dispute_pda(&s.binding, 3)).is_none());

    // Drain the bond in a new epoch, then close everything.
    svm.warp_to_slot(500_000);
    send(
        &mut svm,
        &s.merchant,
        vec![Instruction::new_with_bytes(
            harbor::id(),
            &harbor::instruction::WithdrawBond { amount: 500_000 }.data(),
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
    .unwrap();
    assert_eq!(token_balance(&svm, &s.vault), 0);

    svm.warp_to_slot(1_000_000);
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
