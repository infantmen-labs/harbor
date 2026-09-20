use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::Instruction, system_program,
        AccountDeserialize, InstructionData, ToAccountMetas,
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

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn bond_pda(merchant: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"bond", merchant.as_ref(), mint.as_ref()],
        &harbor::id(),
    )
    .0
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
    let merchant_ata_addr =
        CreateAssociatedTokenAccount::new(&mut svm, &merchant, &mint_addr)
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
    let channel = Keypair::new().pubkey();
    let (binding, _) =
        Pubkey::find_program_address(&[b"binding", channel.as_ref()], &program_id);
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
