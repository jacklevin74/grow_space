use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;

declare_id!("7KvbAAK7kP72zcdC24vDn9L51TDV8v9he4hNJ3S7ZU51");

#[program]
pub mod grow_space {
    use super::*;

    pub fn initialize_pda(ctx: Context<InitializePDA>, unique_id: u64) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;

        // Initialize the account with an empty vector
        pda_account.values = Vec::new();
        Ok(())
    }

    pub fn append_value(ctx: Context<AppendValue>, value: u64) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        let payer = &mut ctx.accounts.payer;

        // Calculate new length in bytes
        let new_len = (pda_account.values.len() + 1) * 8 + 16; // u64 is 8 bytes when len is zero, pad with 16
        msg!("pda_account.to_account_info().data_len() {}", pda_account.to_account_info().data_len());
        msg!("new_len {}", new_len);

        // Reallocate if needed
        if pda_account.to_account_info().data_len() < new_len {
            let rent = Rent::get()?;
            let new_size = 8 + 256 + new_len; // pad with bytes
            let current_balance = **pda_account.to_account_info().lamports.borrow();
            let lamports_needed = rent.minimum_balance(new_size).saturating_sub(current_balance);
            msg!("Lamports needed for new size: {}", lamports_needed);

                transfer_lamports(
                    &payer.to_account_info(),
                    &pda_account.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    lamports_needed,
                )?;

            pda_account.to_account_info().realloc(new_len + 256, false)?;
        }

        pda_account.values.push(value);
        Ok(())
    }
}

pub fn transfer_lamports<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    invoke_signed(
        &system_instruction::transfer(
            from.key,
            to.key,
            lamports,
        ),
        &[
            from.clone(),
            to.clone(),
            system_program.clone(),
        ],
        &[],
    )?;
    msg!("Transferring {} lamports to PDA account", lamports);
    Ok(())
}

#[derive(Accounts)]
#[instruction(unique_id: u64)]
pub struct InitializePDA<'info> {
    #[account(init, seeds = [b"pda_account", payer.key.as_ref(), &unique_id.to_le_bytes()], bump, payer = payer, space = 8 + 8 * 2)] // 8 bytes for discriminator + initial space for 10 u64 values
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendValue<'info> {
    #[account(mut)]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PDAAccount {
    pub values: Vec<u64>,
}

