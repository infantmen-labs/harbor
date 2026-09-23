use payment_channels::state::Channel;
use pinocchio::Address;

#[test]
fn test_pda_crosscheck() {
    let payer = Address::new_from_array([1u8; 32]);
    let payee = Address::new_from_array([2u8; 32]);
    let mint = Address::new_from_array([3u8; 32]);
    let auth = Address::new_from_array([4u8; 32]);
    let (mine, bump_a) = payment_channels::state::Channel::find_pda(
        &payer, &payee, &mint, &auth, 42, 0,
    );
    let _ = Channel::LEN;
    println!("program-side: {} bump={}", hex_of(mine.as_ref()), bump_a);

    let program_id =
        anchor_lang::prelude::Pubkey::new_from_array(*payment_channels::ID.as_array());
    let (sdk, bump_b) = anchor_lang::prelude::Pubkey::find_program_address(
        &[
            b"channel".as_ref(),
            &[1u8; 32],
            &[2u8; 32],
            &[3u8; 32],
            &[4u8; 32],
            &42u64.to_le_bytes(),
            &0u64.to_le_bytes(),
        ],
        &program_id,
    );
    println!("sdk-side:     {} bump={}", hex_of(sdk.as_ref()), bump_b);
    assert_eq!(mine.as_ref(), sdk.as_ref());
    assert_eq!(bump_a, bump_b);
}

fn hex_of(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
