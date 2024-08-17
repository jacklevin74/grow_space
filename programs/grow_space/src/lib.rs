mod bpf_writer;

use anchor_lang::prelude::*;
use solana_program::program::invoke;
use solana_program::program::set_return_data;
use solana_program::system_instruction;

declare_id!("DzDvqRGfLJkFxUB4sBCxS4EuXk2EK62PPpAFfPz6h6p5");

const PDA_ACCOUNT_SEED: &[u8; 11] = b"pda_account";
const USER_ACCOUNT_PDA_SEED: &[u8; 16] = b"user_account_pda";
const ACCOUNTING_SEED: &[u8; 10] = b"accounting";

#[program]
pub mod grow_space {
    use super::*;

    pub fn initialize_pda(_ctx: Context<InitializePDA>, _unique_id: u64) -> Result<()> {
        Ok(())
    }

    pub fn aggregate_pubkey_counts(
        ctx: Context<PerformAccounting>,
        start_block_id: u64,
    ) -> Result<()> {
        // Look back to previous block_id pda
        let (pda, _bump) = Pubkey::find_program_address(
            &[PDA_ACCOUNT_SEED, &start_block_id.to_le_bytes()],
            ctx.program_id,
        );
        msg!("PDA Account for block ID {}: {}", start_block_id, pda);

        // Load the PDA account, this is coming from client
        let pda_account = &ctx.accounts.pda_account;

        // Ensure there is at least one BlockEntry and one FinalHashEntry in the first BlockEntry
        let first_final_hash_entry = pda_account
            .block_ids
            .first()
            .and_then(|block_entry| block_entry.final_hashes.first())
            .ok_or_else(|| error!(ErrorCode::FinalHashEntryNotFound))?;

        // Convert final_hash bytes to string
        let final_hash_str = std::str::from_utf8(&first_final_hash_entry.final_hash)
            .map_err(|_| error!(ErrorCode::InvalidUtf8))?;

        // Display the final hash and associated pubkeys from the first BlockEntry
        msg!(
            "First final hash for the first block_id is {:?}",
            final_hash_str
        );
        msg!("Total count: {:?}", first_final_hash_entry.pubkeys.len());
        /*

        // Collect all pubkeys from the first final_hash_entry that have an inblock value less than the current start_block_id
        // or do not exist in the voter_accounting at all
        let all_pubkeys: Vec<Pubkey> = first_final_hash_entry.pubkeys.iter()
            .filter_map(|&pubkey| {
                if ctx.accounts.voter_accounting.pubkey_counts.iter().all(|count| count.user != pubkey || count.inblock < start_block_id) {
                    Some(pubkey)
                } else {
                    None
                }
            })
            .collect();

        if all_pubkeys.len() < 3 {
            return Err(error!(ErrorCode::InsufficientPubkeys));
        }

        // Select and write 3 random pubkeys manually
        let mut index = (anchor_lang::solana_program::sysvar::clock::Clock::get().unwrap().unix_timestamp % all_pubkeys.len() as i64) as usize;

        for _ in 0..3 {
            let pubkey = all_pubkeys[index];
            msg!("Index for pubkey: {} index {}", pubkey, index);

            // Increment the index and use modulo to wrap around if necessary
            index = (index + 1) % all_pubkeys.len();

            // Find or create the user PDA account
            let (_user_pda, _user_bump) = Pubkey::find_program_address(&[b"user_pda", pubkey.as_ref()], ctx.program_id);
            let user_pda_account = &mut ctx.accounts.user_pda_account;

            // Initialize or update the user PDA account
            if user_pda_account.user == Pubkey::default() {
                user_pda_account.user = pubkey;
                user_pda_account.credit = 1;
                user_pda_account.debit = 0;
                user_pda_account.inblock = start_block_id;
            } else if user_pda_account.inblock < start_block_id {
                user_pda_account.credit = 1;
                user_pda_account.debit = 0;
                user_pda_account.inblock = start_block_id;
            }
        }
        */

        Ok(())
    }

    pub fn append_data(ctx: Context<AppendData>, block_id: u64, final_hash: String) -> Result<()> {
        // let mut pda_account = &mut ctx.accounts.pda_account;
        let user_account_pda = &mut ctx.accounts.user_account_pda;
        // let prev_pda_account = &ctx.accounts.prev_pda_account;

        if user_account_pda.user == Pubkey::default() {
            user_account_pda.user = ctx.accounts.payer.key();
        }

        msg!(
            "block_id: {} for pda: {:?} len: {}",
            block_id,
            ctx.accounts.pda_account.key(),
            ctx.accounts.pda_account.to_account_info().data_len()
        );

        // Ensure there is at least one BlockEntry and one FinalHashEntry in the first BlockEntry
        if ctx.accounts.prev_pda_account.is_some() {
            let prev_pda_account = ctx.accounts.prev_pda_account.clone().unwrap();
            // Log some details about the previous PDA account for debugging
            msg!(
                "Previous PDA Account Block ID for pda: {:?} Length: {}",
                prev_pda_account.key(),
                prev_pda_account.block_ids.len()
            );

            // for each BlockEntry of previous block
            for entry in prev_pda_account.block_ids.iter() {
                // calculate total count of votes
                let total_count: u64 = entry
                    .final_hashes
                    .iter()
                    .map(|h| h.pubkeys.len() as u64)
                    .sum();
                // sort hashes by votes count in reverse order
                let mut hashes_sorted = entry.final_hashes.clone();
                hashes_sorted.sort_by_key(|h| std::cmp::Reverse(h.pubkeys.len()));

                // check if the highest score gets over 50% of total votes
                if hashes_sorted[0].pubkeys.len() as u64 > total_count / 2 {
                    // for each voter in the voting vector
                    for voter in hashes_sorted[0].pubkeys.iter() {
                        // find voter's PDA
                        let (voter_pda, _) = Pubkey::find_program_address(
                            &[USER_ACCOUNT_PDA_SEED, (*voter).as_ref()],
                            ctx.program_id,
                        );
                        // find account info
                        for user_account in ctx.remaining_accounts.iter() {
                            // serialize voter's PDA
                            if voter_pda == *user_account.key {
                                let buf: &mut [u8] =
                                    &mut user_account.try_borrow_mut_data().unwrap();
                                let mut voter_account: UserAccountPda =
                                    UserAccountPda::try_deserialize(&mut &*buf)?;

                                // prevent self-voting
                                if voter_account.user != ctx.accounts.payer.key() {
                                    // perform accounting on voter's PDA
                                    if voter_account.inblock < block_id {
                                        msg!(
                                            "Eligible voter: {} in-block: {} block: {}",
                                            voter.key(),
                                            voter_account.inblock,
                                            block_id,
                                        );
                                        voter_account.credit += 1;
                                        voter_account.inblock = block_id;
                                        msg!("Voter's new credit: {}", voter_account.credit);
                                        let mut writer: bpf_writer::BpfWriter<&mut [u8]> =
                                            bpf_writer::BpfWriter::new(&mut *buf);
                                        voter_account.try_serialize(&mut writer)?;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        msg!(
            "Dump user_account_pda: {} {} {} {}",
            user_account_pda.user,
            user_account_pda.credit,
            user_account_pda.debit,
            user_account_pda.inblock
        );

        // Log the current data size before modification
        msg!(
            "Current data length allocation: {}",
            ctx.accounts.pda_account.to_account_info().data_len()
        );

        // Convert the final_hash string to bytes and truncate to 64 bits (8 bytes)
        let final_hash_bytes: [u8; 8] = {
            let mut bytes = final_hash.as_bytes().to_vec();
            bytes.resize(8, 0); // Ensure it has at least 8 bytes
            bytes[..8].try_into().expect("slice with incorrect length")
        };

        // Convert truncated bytes back to string for logging
        let final_hash_truncated_str = String::from_utf8_lossy(&final_hash_bytes);

        // Log the incoming final_hash string and its truncated byte representation
        msg!("Incoming final_hash string: {}", final_hash);
        msg!(
            "Truncated final_hash bytes as string: {}",
            final_hash_truncated_str
        );

        let mut found = false;
        let mut add_size: usize = 0;
        let pda_account = &mut ctx.accounts.pda_account;
        for block_entry in &mut pda_account.block_ids {
            if block_entry.block_id == block_id {
                found = true;
                let mut hash_found = false;
                for hash_entry in &mut block_entry.final_hashes {
                    if hash_entry.final_hash == final_hash_bytes {
                        if !hash_entry.pubkeys.contains(ctx.accounts.payer.key) {
                            hash_entry.pubkeys.push(*ctx.accounts.payer.key);
                            add_size += 32;
                        }
                        hash_found = true;
                        break;
                    }
                }
                if !hash_found {
                    let final_hashes = &mut block_entry.final_hashes;
                    add_size += 32 + 8 + 8;
                    final_hashes.push(FinalHashEntry {
                        final_hash: final_hash_bytes,
                        pubkeys: vec![*ctx.accounts.payer.key],
                        // count: 1,
                    });
                }
                break;
            }
        }

        if !found {
            ctx.accounts.pda_account.block_ids.push(BlockEntry {
                block_id,
                final_hashes: vec![FinalHashEntry {
                    final_hash: final_hash_bytes,
                    pubkeys: vec![ctx.accounts.payer.key.clone()],
                    // count: 1,
                }],
            });
            add_size += 64;
        }
        msg!("PDA account: {:?}", ctx.accounts.pda_account.block_ids);

        // Log the new data size after modification
        // let current_data_after = calculate_data_size(&ctx.accounts.pda_account.block_ids);
        msg!(
            "New length of pda_account.entries: {}",
            ctx.accounts.pda_account.block_ids.len()
        );
        // msg!("Data size after in bytes: {}", current_data_after);
        msg!(
            "Current data length allocation: {} new: {}",
            ctx.accounts.pda_account.to_account_info().data_len(),
            add_size
        );

        // Check if the data size exceeds 80% of the allocated space
        let data_len = ctx.accounts.pda_account.to_account_info().data_len();
        let rent = Rent::get()?;
        let new_size = data_len + add_size; //
        let lamports_needed = rent
            .minimum_balance(new_size as usize)
            .saturating_sub(ctx.accounts.pda_account.to_account_info().lamports());

        if lamports_needed > 0 {
            // Transfer lamports to cover the additional rent
            invoke(
                &system_instruction::transfer(
                    &ctx.accounts.payer.key(),
                    &ctx.accounts.pda_account.to_account_info().key(),
                    lamports_needed,
                ),
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.pda_account.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )
            .expect("Rent payment failed");
        }

        ctx.accounts
            .pda_account
            .to_account_info()
            .realloc(new_size as usize, false)
            .expect("Reallocation failed");

        msg!(
            "Reallocated PDA account to new size: {}",
            ctx.accounts.pda_account.to_account_info().data_len()
        );

        Ok(())
    }

    pub fn get_voter_accounting_chunk(
        ctx: Context<GetVoterAccounting>,
        offset: u64,
        limit: u64,
    ) -> Result<()> {
        let voter_accounting = &ctx.accounts.voter_accounting;

        let end =
            std::cmp::min(offset + limit, voter_accounting.pubkey_counts.len() as u64) as usize;
        let chunk = &voter_accounting.pubkey_counts[offset as usize..end];

        // Serialize the chunk of data
        let data = chunk
            .try_to_vec()
            .map_err(|_| error!(ErrorCode::SerializationError))?;

        // Set the return data
        set_return_data(&data);

        Ok(())
    }
}

/*
fn calculate_data_size(entries: &Vec<BlockEntry>) -> usize {
    let mut total_size = 0;
    for entry in entries {
        // Size of block_id
        total_size += 8;
        // Size of each FinalHashEntry in final_hashes
        for hash_entry in &entry.final_hashes {
            total_size += 8 + 8; // Assuming 8 bytes for final_hash and 8 bytes for count
            total_size += hash_entry.pubkeys.len() * 32; // Each Pubkey is 32 bytes
        }
    }
    total_size
}
 */

#[derive(Accounts)]
#[instruction(_unique_id: u64)]
pub struct InitializePDA<'info> {
    #[account(
        init_if_needed,
        seeds = [
            PDA_ACCOUNT_SEED,
            _unique_id.to_le_bytes().as_ref()
        ],
        bump,
        payer = payer,
        space = 8 + PDAAccount::INIT_SPACE,
    )]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/*
#[derive(Accounts)]
pub struct PubkeyCount<'info> {
    #[account(init_if_needed, seeds = [b"pubkey_count"], bump, payer = payer, space = 16)]
    pub pubkey_count_account: Account<'info, CountAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
 */

#[derive(Accounts)]
#[instruction(block_id: u64, final_hash: String)]
pub struct AppendData<'info> {
    #[account(mut)]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub prev_pda_account: Option<Account<'info, PDAAccount>>,
    #[account(
        init_if_needed,
        seeds = [
            USER_ACCOUNT_PDA_SEED,
            payer.key().as_ref()
        ],
        bump,
        payer = payer,
        space = 8 + UserAccountPda::INIT_SPACE,
        // constraint = user_account_pda.user == payer.key()
    )]
    pub user_account_pda: Box<Account<'info, UserAccountPda>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(start_block_id: u64)]
pub struct PerformAccounting<'info> {
    #[account(mut)]
    pub pda_account: Box<Account<'info, PDAAccount>>,
    #[account(
        init_if_needed,
        seeds = [ACCOUNTING_SEED],
        bump,
        payer = payer,
        space = 8 + UserAccountPda::INIT_SPACE
    )] // Adjust space as needed
    pub voter_accounting: Box<Account<'info, UserAccountPda>>,
    #[account(
        init_if_needed,
        seeds = [
            USER_ACCOUNT_PDA_SEED,
            payer.key().as_ref()
        ],
        bump,
        payer = payer,
        space = 8 + UserAccountPda::INIT_SPACE
    )]
    pub user_pda_account: Box<Account<'info, UserAccountPda>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetVoterAccounting<'info> {
    pub voter_accounting: Box<Account<'info, VoterAccounting>>,
}

#[derive(Debug, AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct BlockEntry {
    pub block_id: u64,
    #[max_len(0)]
    pub final_hashes: Vec<FinalHashEntry>,
}

#[derive(Debug, AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct FinalHashEntry {
    pub final_hash: [u8; 8],
    #[max_len(0)]
    pub pubkeys: Vec<Pubkey>,
    // pub count: u64,
}

#[account]
#[derive(Debug, InitSpace)]
pub struct UserAccountPda {
    pub user: Pubkey,
    pub credit: u64,
    pub debit: u64,
    pub inblock: u64,
}

#[account]
#[derive(InitSpace, Default)]
pub struct VoterAccounting {
    // user, credit, debit
    #[max_len(0)]
    pub pubkey_counts: Vec<UserAccountPda>,
}

/*
#[account]
#[derive(InitSpace, Default)]
pub struct UserPDAAccount {
    pub user: Pubkey,
    pub credit: u64,
    pub debit: u64,
    pub inblock: u64,
}


#[account]
#[derive(InitSpace, Default)]
pub struct CountAccount {
    pub count: u64,
}

 */

#[account]
#[derive(Debug, InitSpace, Default)]
pub struct PDAAccount {
    #[max_len(0)]
    pub block_ids: Vec<BlockEntry>,
    // pub data_size: u32,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Block entry not found.")]
    BlockEntryNotFound,
    #[msg("Final hash entry not found.")]
    FinalHashEntryNotFound,
    #[msg("Invalid UTF-8 sequence.")]
    InvalidUtf8,
    #[msg("Insufficient pubkeys available.")]
    InsufficientPubkeys,
    #[msg("Serialization error.")]
    SerializationError,
    // Add other error codes as needed
}
