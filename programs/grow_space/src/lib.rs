use anchor_lang::prelude::*;
use solana_program::program::invoke;
use solana_program::system_instruction;

declare_id!("7KvbAAK7kP72zcdC24vDn9L51TDV8v9he4hNJ3S7ZU51");

#[program]
pub mod grow_space {
    use super::*;

    pub fn initialize_pda(ctx: Context<InitializePDA>, _unique_id: u64) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.block_ids = Vec::new();
        Ok(())
    }

    pub fn append_data(ctx: Context<AppendData>, block_id: u64, final_hash: String, pubkey: Pubkey) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;

        // Log the old length and current data size before modification
        let old_len = pda_account.block_ids.len();
        let current_data_before = calculate_data_size(&pda_account.block_ids);
        msg!("Old length of pda_account.entries: {}", old_len);
        msg!("Data size before in bytes: {}", current_data_before);
        msg!("Current data length allocation: {}", pda_account.to_account_info().data_len());

        // Check if the block_id already exists
        if let Some(block_entry) = pda_account.block_ids.iter_mut().find(|entry| entry.block_id == block_id) {
            // If the block_id exists, update the final_hashes
            if let Some(hash_entry) = block_entry.final_hashes.iter_mut().find(|entry| entry.final_hash == final_hash) {
                hash_entry.count += 1;
                if !hash_entry.pubkeys.contains(&pubkey) {
                    hash_entry.pubkeys.push(pubkey);
                }
            } else {
                // Add new final_hash if it doesn't exist
                block_entry.final_hashes.push(FinalHashEntry {
                    final_hash,
                    pubkeys: vec![pubkey],
                    count: 1,
                });
            }
        } else {
            // Add new block_id and final_hash
            pda_account.block_ids.push(BlockEntry {
                block_id,
                final_hashes: vec![FinalHashEntry {
                    final_hash,
                    pubkeys: vec![pubkey],
                    count: 1,
                }],
            });
        }

        // Log the new length and current data size after modification
        let new_len = pda_account.block_ids.len();
        let current_data_after = calculate_data_size(&pda_account.block_ids);
        msg!("New length of pda_account.entries: {}", new_len);
        msg!("Data size after in bytes: {}", current_data_after);
        msg!("Current data length allocation: {}", pda_account.to_account_info().data_len());

        // Check if the data size exceeds 80% of the allocated space
        let data_len = pda_account.to_account_info().data_len();
        if current_data_after > (data_len as usize) * 80 / 100 {
            let rent = Rent::get()?;
            let new_size = data_len + 4000; // Add at least 4000 bytes
            let lamports_needed = rent.minimum_balance(new_size).saturating_sub(pda_account.to_account_info().lamports());

            if lamports_needed > 0 {
                // Transfer lamports to cover the additional rent
                invoke(
                    &system_instruction::transfer(
                        &ctx.accounts.payer.key(),
                        &pda_account.to_account_info().key(),
                        lamports_needed,
                    ),
                    &[
                        ctx.accounts.payer.to_account_info(),
                        pda_account.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )?;
            }

            pda_account.to_account_info().realloc(new_size, false)?;
            msg!("Reallocated PDA account to new size: {}", new_size);
        }

        Ok(())
    }
}

fn calculate_data_size(entries: &Vec<BlockEntry>) -> usize {
    let mut total_size = 0;
    for entry in entries {
        // Size of block_id
        total_size += 8;
        // Size of each FinalHashEntry in final_hashes
        for hash_entry in &entry.final_hashes {
            total_size += 32 + 8; // Assuming 32 bytes for final_hash and 8 bytes for count
            total_size += hash_entry.pubkeys.len() * 32; // Each Pubkey is 32 bytes
        }
    }
    total_size
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BlockEntry {
    pub block_id: u64,
    pub final_hashes: Vec<FinalHashEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalHashEntry {
    pub final_hash: String,
    pub pubkeys: Vec<Pubkey>,
    pub count: u64,
}

#[derive(Accounts)]
#[instruction(unique_id: u64)]
pub struct InitializePDA<'info> {
    #[account(init, seeds = [b"pda_account", payer.key.as_ref(), &unique_id.to_le_bytes()], bump, payer = payer, space = 8 + 5 * (8 + 5 * (32 + 8 + 3 * 10)))]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendData<'info> {
    #[account(mut)]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PDAAccount {
    pub block_ids: Vec<BlockEntry>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Maximum number of entries reached.")]
    MaxEntriesReached,
}

