# XEN Blocks Voting Program

## Installation

### JS Modules

```npm i```

### Rust Modules

```anchor build```

#### After First Time Build

1. Run `anchor keys list`
2. Copy program ID
3. Replace Program ID in `./programs/grow_space/src/lib.rs` with the copied string
4. Run `anchor build` again

## Running tests

```anchor test```