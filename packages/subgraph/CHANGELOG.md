# Aragon Core Subgraph

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [UPCOMING]

### Changed
- Changes callId in `Executed` event from `uint256` to `bytes32`

## 0.6.2-alpha

### Added

- Added `startDate` and `endDate` to all `ProposalCreated` events.
- Adds `startDate` and `endDate` fields to Multisig proposals.

### Changed

- Changed the type of `ProposalParameter.minApprovals`, `MultisigSettingsUpdated.minApprovals` from `uint256` to `uint16` , and added `approvals`(uint16) in the `Proposal` struct.
- Updates `ADDRESSLIST_VOTING_INTERFACE` and `ADMIN_INTERFACE`
- Changed all occurences of `oracle` to `condition`.

### Removed

- Removes `Tally` struct as well as `addressListLength` and moves `approvals` in `Proposal`.


## 0.6.1-alpha

On 2023-01-11 17:06:50

### Changed

- Ignores `None` votes from addresslist voting and token voting
- Updates `MULTISIG_INTERFACE`

### Removed

- Removes `open` and `executable` fields from Multisig proposals

## 0.5.0-alpha

On 2022-12-09 15:16:22

### Added

- Added support for the `AdminPlugin`.
- Fixed the early execution criterion in `MajorityVoting` by calculating the `worstCaseSupport` quantity.
- Adds support for `PluginRepo`, `PluginRegistry` and `PluginSetupProcessor`
- Added `Withdrawn`, `TrustedForwarderSet`, `StandardCallbackRegistered` and `handleStandardCallbackRegistered` events handling to `DaoTemplate`
- Added support for the new `PluginSettingsUpdated` event of the `Multisig` plugin

### Changed

- Unified naming of the `MajorityVoting` related variables and functions as well as reordering of the function arguments.
- Changed `MajorityVoting` to use `minParticipation` and unified the parameter order.
- Renamed *package to *plugin.
- Renamed Allowlist to Addresslist.
- Improved test recompilation.
- Marks some entity as immutable.
- Fixes calcuation crash in erc20 voting, when no votes were cast
- Added the field `onlyListed` to the `MultisigPlugin` type

## 0.4.0-alpha

On 2022-10-07 15:20:00

### Added

- `executable` property to `ERC20VotingProposal` and `AllowlistProposal`.

## 0.2.1-alpha

On 2022-10-03 10:38:36

### Added

- Added an `ERC721Token` entity and `Token` interface to be used by `TokenVotingPlugin`.
- Added `members` to `ERC20VotingPackage`.
- Added `lastUpdated` to `ERC20VotingVoter`.
- Added `voteCount` to both `ERC20VotingProposal` and `AllowlistProposal`.
- Added type field to `VaultTransfer` to differentiate between deposits and withdraws

### Changed

- Renamed contracts, events, and parameters in `MajorityVoting`:
  - `ERC20Voting` to `TokenVoting`
  - `AllowlistVoting` to `AddresslistVoting` and `allowlist` to `addresslist`
  - `VoteCreated` and `VoteExecuted` to `ProposalCreated` and `ProposalExecuted`
  - `voteId` to `proposalId`
- Changed `users` to `members` in `AllowlistPackage`.
- Adapted subgraph names according to the renaming of the contracts.
- Updated `manifest`, `registry`, `registry.test`.
- Refactored import statements.
- Refactored event names.
- Refactored `deposits` and `withdraws` into one field `transfers`.
- Refactored `VaultWithdraw` and `VaultDeposit` into one type `VaultTransfer`.
- Removes not null enforcing `Proposal.metadata`.

## v0.2.0-alpha

### Added

- Remove decoding `metadata` hash from Subgraph.
- Expand `Proposal` entity to include `creator`, `metadata` and `createdAt`.

### Changed

### Removed

## v0.1.0-alpha

### Added

- Implement mapping and unit testing for events of `MetaTxComponent`.
- Utilizing interfaceId for distinguishing between `ERC20Voting` and `WhitelistVoting`.
- Added eslint.

### Changed

- Renamed the event `SetMetadata` to `MetadataSet`
- Updated Subgraph to adapt to the changes in the core contracts.
- Refactored subgraph's unit testing, applying clean code standards.

## v0.0.1-alpha

### Added

- First version of the package.
- Mapping all the main events of the core contracts.
- Mapping all the main events of both `ERC20Voting` and `WhitelistVoting`.
