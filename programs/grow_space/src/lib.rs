use anchor_lang::prelude::*;

declare_id!("7KvbAAK7kP72zcdC24vDn9L51TDV8v9he4hNJ3S7ZU51");

#[program]
pub mod grow_space {
    use super::*;

    pub fn initialize_pda(ctx: Context<InitializePDA>, _unique_id: u64) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.block_ids = Vec::new();
        Ok(())
    }

    pub fn append_data(ctx: Context<AppendData>, block_id: u64, final_hash: String) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;

        // Check if the block_id already exists
        if let Some(block_entry) = pda_account.block_ids.iter_mut().find(|entry| entry.block_id == block_id) {
            // If the block_id exists, update the final_hashes
            if let Some(hash_entry) = block_entry.final_hashes.iter_mut().find(|entry| entry.final_hash == final_hash) {
                hash_entry.count += 1;
            } else {
                // Add new final_hash if it doesn't exist
                block_entry.final_hashes.push(FinalHashEntry {
                    final_hash,
                    count: 1,
                });
            }
        } else {
            // Add new block_id and final_hash
            pda_account.block_ids.push(BlockEntry {
                block_id,
                final_hashes: vec![FinalHashEntry {
                    final_hash,
                    count: 1,
                }],
            });
        }

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BlockEntry {
    pub block_id: u64,
    pub final_hashes: Vec<FinalHashEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FinalHashEntry {
    pub final_hash: String,
    pub count: u64,
}

#[derive(Accounts)]
#[instruction(unique_id: u64)]
pub struct InitializePDA<'info> {
    #[account(init, seeds = [b"pda_account", payer.key.as_ref(), &unique_id.to_le_bytes()], bump, payer = payer, space = 8 + 10 * (8 + 10 * (32 + 8)))]
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

