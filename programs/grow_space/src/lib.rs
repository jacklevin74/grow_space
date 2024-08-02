use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;

declare_id!("7KvbAAK7kP72zcdC24vDn9L51TDV8v9he4hNJ3S7ZU51");

#[program]
pub mod grow_space {
    use super::*;

    pub fn initialize_pda(ctx: Context<InitializePDA>, _unique_id: u64) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.entries = Vec::new();
        Ok(())
    }

    pub fn append_pubkey(ctx: Context<AppendPubkey>, new_pubkey: Pubkey) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        let payer = &mut ctx.accounts.payer;

        if pda_account.entries.iter().any(|entry| entry.pubkey == new_pubkey) {
            return Ok(());
        }

        let new_len = (pda_account.entries.len() + 1) * 32 + 32;
        msg!("pda_account.to_account_info().data_len() {}", pda_account.to_account_info().data_len());
        msg!("new_len {}", new_len);

        if pda_account.to_account_info().data_len() < new_len {
            let rent = Rent::get()?;
            let new_size = 8 + 256 + new_len;
            let current_balance = **pda_account.to_account_info().lamports.borrow();
            let lamports_needed = rent.minimum_balance(new_size).saturating_sub(current_balance);
            msg!("Lamports needed for new size: {}", lamports_needed);

            if lamports_needed > 0 {
                transfer_lamports(
                    &payer.to_account_info(),
                    &pda_account.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    lamports_needed,
                )?;
            }

            pda_account.to_account_info().realloc(new_len + 256, false)?;
        }

        pda_account.entries.push(PubkeyEntry { pubkey: new_pubkey });
        Ok(())
    }

    pub fn initialize_pubkey_values(ctx: Context<InitializePubkeyValues>, _pubkey: Pubkey) -> Result<()> {
        let pubkey_values_account = &mut ctx.accounts.pubkey_values_account;
        pubkey_values_account.values = Vec::new();
        Ok(())
    }

    pub fn append_value(ctx: Context<AppendValue>, _pubkey: Pubkey, value: u64) -> Result<()> {
        let pubkey_values_account = &mut ctx.accounts.pubkey_values_account;

        let new_len = (pubkey_values_account.values.len() + 1) * 8 + 16;
        let current_len = pubkey_values_account.values.len() * 8;
        msg!("pubkey_values_account.values.len() {}", pubkey_values_account.values.len());
        msg!("new_len {}", new_len);

        if current_len < new_len {
            let rent = Rent::get()?;
            let new_size = current_len + 8 + new_len;
            let current_balance = **pubkey_values_account.to_account_info().lamports.borrow();
            let lamports_needed = rent.minimum_balance(new_size).saturating_sub(current_balance);
            msg!("Lamports needed for new size: {}", lamports_needed);

            if lamports_needed > 0 {
                transfer_lamports(
                    &ctx.accounts.payer.to_account_info(),
                    &pubkey_values_account.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    lamports_needed,
                )?;
            }

            pubkey_values_account.to_account_info().realloc(new_size, false)?;
        }

        pubkey_values_account.values.push(value);
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PubkeyEntry {
    pub pubkey: Pubkey,
}

#[derive(Accounts)]
#[instruction(unique_id: u64)]
pub struct InitializePDA<'info> {
    #[account(init, seeds = [b"pda_account", payer.key.as_ref(), &unique_id.to_le_bytes()], bump, payer = payer, space = 8 + 32 * 2)]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendPubkey<'info> {
    #[account(mut)]
    pub pda_account: Account<'info, PDAAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pubkey: Pubkey)]
pub struct InitializePubkeyValues<'info> {
    #[account(init, seeds = [b"pubkey_values", pubkey.as_ref()], bump, payer = payer, space = 8 + 8 * 1)]
    pub pubkey_values_account: Account<'info, PubkeyValues>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pubkey: Pubkey)]
pub struct AppendValue<'info> {
    #[account(mut, seeds = [b"pubkey_values", pubkey.as_ref()], bump)]
    pub pubkey_values_account: Account<'info, PubkeyValues>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PDAAccount {
    pub entries: Vec<PubkeyEntry>,
}

#[account]
pub struct PubkeyValues {
    pub values: Vec<u64>,
}

