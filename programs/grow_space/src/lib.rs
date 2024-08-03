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
        pda_account.data_size = 0;
        Ok(())
    }

    pub fn append_data(ctx: Context<AppendData>, block_id: u64, final_hash: String, pubkey: Pubkey) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;

        // Log the current data size before modification
        let current_data_before = pda_account.data_size;
        msg!("Data size before in bytes: {}", current_data_before);
        msg!("Current data length allocation: {}", pda_account.to_account_info().data_len());

        let mut found = false;
        for block_entry in &mut pda_account.block_ids {
            if block_entry.block_id == block_id {
                found = true;
                let mut hash_found = false;
                for hash_entry in &mut block_entry.final_hashes {
                    if hash_entry.final_hash == final_hash {
                        if !hash_entry.pubkeys.contains(&pubkey) {
                            hash_entry.pubkeys.push(pubkey);
                            hash_entry.count += 1; // Increment count only when a new pubkey is added
                        }
                        hash_found = true;
                        break;
                    }
                }
                if !hash_found {
                    block_entry.final_hashes.push(FinalHashEntry {
                        final_hash: final_hash.clone(),
                        pubkeys: vec![pubkey],
                        count: 1,
                    });
                }
                break;
            }
        }

        if !found {
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
            let lamports_needed = rent.minimum_balance(new_size as usize).saturating_sub(pda_account.to_account_info().lamports());

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

            pda_account.to_account_info().realloc(new_size as usize, false)?;
            msg!("Reallocated PDA account to new size: {}", new_size);
        }

        // Update data size in the PDA
        pda_account.data_size = pda_account.data_size.saturating_add(current_data_after as u32 - current_data_before as u32);

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
    #[account(init, seeds = [b"pda_account",  unique_id.to_le_bytes().as_ref()], bump, payer = payer, space = 8 + 5 * (8 + 5 * (32 + 8 + 3 * 10)))]
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
    pub data_size: u32,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Maximum number of entries reached.")]
    MaxEntriesReached,
}

