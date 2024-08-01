use anchor_lang::prelude::*;

declare_id!("7KvbAAK7kP72zcdC24vDn9L51TDV8v9he4hNJ3S7ZU51");

#[program]
pub mod grow_space {
    use super::*;

    pub fn create_pda(ctx: Context<CreatePDA>, initial_values: Vec<u64>) -> Result<()>{
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.values = initial_values;
        Ok(())
    }

    pub fn append_value(ctx: Context<AppendValue>, value: u64) -> Result<()>{
        let pda_account = &mut ctx.accounts.pda_account;

        // Calculate new length in bytes
        let new_len = (pda_account.values.len() + 1) * 8; // u64 is 8 bytes

        // Reallocate if needed
        if pda_account.to_account_info().data_len() < 8 + new_len {
            pda_account.to_account_info().realloc(8 + new_len, false)?;
        }

        pda_account.values.push(value);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePDA<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + 8 * 10)] // 8 bytes for discriminator + initial space for 10 u64 values
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendValue<'info> {
    #[account(mut)]
    pub pda_account: Account<'info, PDAAccount>,
}

#[account]
pub struct PDAAccount {
    pub values: Vec<u64>,
}
