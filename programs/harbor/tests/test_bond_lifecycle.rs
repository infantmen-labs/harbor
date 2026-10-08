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

fn bond_pda(merchant: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"bond", merchant.as_ref(), mint.as_ref()], &harbor::id()).0
}

#[test]
fn test_bond_lifecycle() {
    let program_id = harbor::id();
    let merchant = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/harbor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&merchant.pubkey(), 10_000_000_000).unwrap();

    // Mint with 6 decimals, authority = merchant.
    let mint_addr = CreateMint::new(&mut svm, &merchant)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);

    // Merchant ATA funded with 1_000_000 units.
    let merchant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
        .send()
        .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(
        &mut svm,
        &merchant,
        &mint_addr,
        &merchant_ata_addr,
        1_000_000,
    )
    .send()
    .unwrap();

    let bond = bond_pda(&merchant.pubkey(), &mint);
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );

    // register_merchant rejects zero SLA.
    let bad = send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RegisterMerchant {
                sla_bps: 0,
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
    );
    assert!(bad.is_err());

    // register_merchant happy path.
    send(
        &mut svm,
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

    // post_bond moves 400_000 into the vault.
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::PostBond { amount: 400_000 }.data(),
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
    assert_eq!(token_balance(&svm, &vault), 400_000);

    // top_up_bond adds 100_000.
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::TopUpBond { amount: 100_000 }.data(),
            harbor::accounts::TopUpBond {
                merchant: merchant.pubkey(),
                bond,
                mint,
                merchant_ata,
                vault,
                token_program,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &vault), 500_000);

    // Immediate withdraw fails: timelock has not passed.
    let early = send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::WithdrawBond { amount: 10_000 }.data(),
            harbor::accounts::WithdrawBond {
                merchant: merchant.pubkey(),
                bond,
                mint,
                merchant_ata,
                vault,
                token_program,
            }
            .to_account_metas(None),
        )],
    );
    assert!(early.is_err());

    // bind_channel records the binding.
    let channel = mock_channel(&mut svm, &merchant.pubkey(), &merchant.pubkey(), &mint, 0);
    let (binding, _) = Pubkey::find_program_address(&[b"binding", channel.as_ref()], &program_id);
    send(
        &mut svm,
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
    let acc = svm.get_account(&binding).unwrap();
    let bound = harbor::ChannelBinding::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(bound.channel, channel);
    assert_eq!(bound.bond, bond);
    assert_eq!(bound.max_spend, 250_000);
}

#[test]
fn test_fake_vault_rejected_on_refund() {
    // RefundUnused closes the bond around an empty vault: owner+mint+empty
    // checks alone accept a fake empty account naming the bond PDA, so the
    // canonical-vault gate (same as withdraw_bond) must hold here too.
    let program_id = harbor::id();
    let merchant = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/harbor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&merchant.pubkey(), 10_000_000_000).unwrap();

    let mint_addr = CreateMint::new(&mut svm, &merchant)
        .decimals(6)
        .send()
        .unwrap();
    let mint = a2p(&mint_addr);
    let merchant_ata_addr = CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
        .send()
        .unwrap();
    let merchant_ata = a2p(&merchant_ata_addr);
    MintTo::new(
        &mut svm,
        &merchant,
        &mint_addr,
        &merchant_ata_addr,
        1_000_000,
    )
    .send()
    .unwrap();

    let bond = bond_pda(&merchant.pubkey(), &mint);
    let token_program = a2p(&TOKEN_ID);
    let ata_program: Pubkey = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap();
    let (vault, _) = Pubkey::find_program_address(
        &[bond.as_ref(), token_program.as_ref(), mint.as_ref()],
        &ata_program,
    );
    send(
        &mut svm,
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
    send(
        &mut svm,
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

    // Drain past the timelock so refund_unused can run at all.
    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::WithdrawBond { amount: 500_000 }.data(),
            harbor::accounts::WithdrawBond {
                merchant: merchant.pubkey(),
                bond,
                mint,
                merchant_ata,
                vault,
                token_program,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert_eq!(token_balance(&svm, &vault), 0);

    // Fake empty vault naming the bond PDA as owner.
    let fake = Keypair::new();
    svm.airdrop(&fake.pubkey(), 10_000_000).unwrap();
    let mut acc = svm.get_account(&fake.pubkey()).unwrap();
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(bond.as_ref());
    data[108] = 1; // Tokenkeg AccountState::Initialized
    acc.data = data;
    acc.owner = token_program;
    svm.set_account(fake.pubkey(), acc).unwrap();

    svm.warp_to_slot(svm.get_sysvar::<Clock>().slot + 500);
    let r = send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RefundUnused {}.data(),
            harbor::accounts::RefundUnused {
                merchant: merchant.pubkey(),
                bond,
                mint,
                vault: fake.pubkey(),
                merchant_ata,
                token_program,
            }
            .to_account_metas(None),
        )],
    );
    assert!(r.is_err());
    assert!(r.unwrap_err().contains("InvalidVault"));
    // Bond survives the rejected refund.
    assert!(svm.get_account(&bond).is_some());

    // Real vault closes cleanly.
    send(
        &mut svm,
        &merchant,
        vec![Instruction::new_with_bytes(
            program_id,
            &harbor::instruction::RefundUnused {}.data(),
            harbor::accounts::RefundUnused {
                merchant: merchant.pubkey(),
                bond,
                mint,
                vault,
                merchant_ata,
                token_program,
            }
            .to_account_metas(None),
        )],
    )
    .unwrap();
    assert!(svm.get_account(&bond).is_none());
    assert!(svm.get_account(&vault).is_none());
}
