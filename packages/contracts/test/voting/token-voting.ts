import {expect} from 'chai';
import {ethers, waffle} from 'hardhat';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

import ERC20Governance from '../../artifacts/contracts/tokens/GovernanceERC20.sol/GovernanceERC20.json';
import {DAO} from '../../typechain';
import {findEvent, DAO_EVENTS, VOTING_EVENTS} from '../../utils/event';
import {getMergedABI} from '../../utils/abi';
import {
  VoteOption,
  pct16,
  getTime,
  advanceTime,
  advanceTimeTo,
} from '../test-utils/voting';
import {customError, ERRORS} from '../test-utils/custom-error-helper';

const {deployMockContract} = waffle;

describe('TokenVoting', function () {
  let signers: SignerWithAddress[];
  let voting: any;
  let dao: DAO;
  let governanceErc20Mock: any;
  let dummyActions: any;
  let dummyMetadata: string;

  const id = 0;

  let mergedAbi: any;
  let tokenVotingFactoryBytecode: any;

  before(async () => {
    signers = await ethers.getSigners();

    ({abi: mergedAbi, bytecode: tokenVotingFactoryBytecode} =
      await getMergedABI(
        // @ts-ignore
        hre,
        'TokenVoting',
        ['DAO']
      ));

    dummyActions = [
      {
        to: signers[0].address,
        data: '0x00000000',
        value: 0,
      },
    ];

    dummyMetadata = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes('0x123456789')
    );

    const DAO = await ethers.getContractFactory('DAO');
    dao = await DAO.deploy();
    await dao.initialize(
      '0x',
      signers[0].address,
      ethers.constants.AddressZero
    );
  });

  beforeEach(async () => {
    governanceErc20Mock = await deployMockContract(
      signers[0],
      ERC20Governance.abi
    );

    const TokenVotingFactory = new ethers.ContractFactory(
      mergedAbi,
      tokenVotingFactoryBytecode,
      signers[0]
    );
    voting = await TokenVotingFactory.deploy();

    dao.grant(
      dao.address,
      voting.address,
      ethers.utils.id('EXECUTE_PERMISSION')
    );
  });

  describe('initialize: ', async () => {
    it('reverts if trying to re-initialize', async () => {
      await voting.initialize(
        dao.address,
        1,
        2,
        3,
        governanceErc20Mock.address
      );

      await expect(
        voting.initialize(dao.address, 2, 1, 3, governanceErc20Mock.address)
      ).to.be.revertedWith(ERRORS.ALREADY_INITIALIZED);
    });

    it('reverts if min duration is 0', async () => {
      await expect(
        voting.initialize(dao.address, 1, 2, 0, governanceErc20Mock.address)
      ).to.be.revertedWith(customError('VoteDurationZero'));
    });
  });

  describe('Proposal creation', async () => {
    let minDuration = 500;
    let supportThreshold = pct16(50);
    let participationThreshold = pct16(20);
    let totalVotingPower = 100;

    it('reverts total token supply while creating a vote is 0', async () => {
      await voting.initialize(
        dao.address,
        1,
        2,
        minDuration,
        governanceErc20Mock.address
      );

      await governanceErc20Mock.mock.getPastTotalSupply.returns(0);
      await expect(
        voting.createProposal(dummyMetadata, [], 0, 0, false, VoteOption.None)
      ).to.be.revertedWith(customError('NoVotingPower'));
    });

    it('reverts if vote duration is less than minDuration', async () => {
      await voting.initialize(
        dao.address,
        1,
        2,
        minDuration,
        governanceErc20Mock.address
      );

      await governanceErc20Mock.mock.getPastTotalSupply.returns(1);
      const block = await ethers.provider.getBlock('latest');
      const current = block.timestamp;
      const startDate = block.timestamp;
      const endDate = startDate + (minDuration - 1);
      await expect(
        voting.createProposal(
          dummyMetadata,
          [],
          startDate,
          endDate,
          false,
          VoteOption.None
        )
      ).to.be.revertedWith(
        customError(
          'VotingPeriodInvalid',
          current + 1, // TODO hacky
          startDate,
          endDate,
          minDuration
        )
      );
    });

    it('should create a vote successfully, but not vote', async () => {
      await voting.initialize(
        dao.address,
        1,
        2,
        minDuration,
        governanceErc20Mock.address
      );

      await governanceErc20Mock.mock.getPastTotalSupply.returns(1);
      await governanceErc20Mock.mock.getPastVotes.returns(0);

      expect(
        await voting.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          false,
          VoteOption.None
        )
      )
        .to.emit(voting, VOTING_EVENTS.PROPOSAL_CREATED)
        .withArgs(id, signers[0].address, dummyMetadata);

      const block = await ethers.provider.getBlock('latest');

      const vote = await voting.getProposal(id);
      expect(vote.open).to.equal(true);
      expect(vote.executed).to.equal(false);
      expect(vote._supportThreshold).to.equal(2);
      expect(vote._participationThreshold).to.equal(1);
      expect(vote.snapshotBlock).to.equal(block.number - 1);
      expect(vote.totalVotingPower).to.equal(1);
      expect(vote.yes).to.equal(0);
      expect(vote.no).to.equal(0);

      expect(vote.startDate.add(minDuration)).to.equal(vote.endDate);

      expect(await voting.canVote(1, signers[0].address)).to.equal(false);

      expect(vote.actions.length).to.equal(1);
      expect(vote.actions[0].to).to.equal(dummyActions[0].to);
      expect(vote.actions[0].value).to.equal(dummyActions[0].value);
      expect(vote.actions[0].data).to.equal(dummyActions[0].data);
    });

    it('should create a vote and cast a vote immediately', async () => {
      await voting.initialize(
        dao.address,
        1,
        2,
        minDuration,
        governanceErc20Mock.address
      );

      await governanceErc20Mock.mock.getPastTotalSupply.returns(1);
      await governanceErc20Mock.mock.getPastVotes.returns(1);

      expect(
        await voting.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          false,
          VoteOption.Yes
        )
      )
        .to.emit(voting, VOTING_EVENTS.PROPOSAL_CREATED)
        .withArgs(id, signers[0].address, dummyMetadata)
        .to.emit(voting, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, signers[0].address, VoteOption.Yes, 1);

      const block = await ethers.provider.getBlock('latest');

      const vote = await voting.getProposal(id);
      expect(vote.open).to.equal(true);
      expect(vote.executed).to.equal(false);
      expect(vote._supportThreshold).to.equal(2);
      expect(vote._participationThreshold).to.equal(1);
      expect(vote.snapshotBlock).to.equal(block.number - 1);
      expect(vote.totalVotingPower).to.equal(1);
      expect(vote.yes).to.equal(1);
      expect(vote.no).to.equal(0);
      expect(vote.abstain).to.equal(0);
    });

    it('reverts creation when voting before the start date', async () => {
      const startOffset = 9;
      let startDate = (await getTime()) + startOffset;
      let endDate = startDate + minDuration;

      await voting.initialize(
        dao.address,
        participationThreshold,
        supportThreshold,
        minDuration,
        governanceErc20Mock.address
      );

      // set voting power to 100
      await governanceErc20Mock.mock.getPastTotalSupply.returns(
        totalVotingPower
      );

      expect(await getTime()).to.be.lessThan(startDate);

      await governanceErc20Mock.mock.getPastVotes.returns(51);

      // Reverts if the vote option is not 'None'
      await expect(
        voting.createProposal(
          dummyMetadata,
          dummyActions,
          startDate,
          endDate,
          false,
          VoteOption.Yes
        )
      ).to.be.revertedWith(
        customError('VoteCastForbidden', id, signers[0].address)
      );

      // Works if the vote option is 'None'
      expect(
        (
          await voting.createProposal(
            dummyMetadata,
            dummyActions,
            startDate,
            endDate,
            false,
            VoteOption.None
          )
        ).value
      ).to.equal(id);
    });
  });

  describe('Proposal + Execute:', async () => {
    let minDuration = 500;
    let supportThreshold = pct16(50);
    let participationThreshold = pct16(20);
    let totalVotingPower = 100;

    const startOffset = 9;
    let startDate: number;
    let endDate: number;

    beforeEach(async () => {
      startDate = (await getTime()) + startOffset;
      endDate = startDate + minDuration;

      await voting.initialize(
        dao.address,
        participationThreshold,
        supportThreshold,
        minDuration,
        governanceErc20Mock.address
      );

      // set voting power to 100
      await governanceErc20Mock.mock.getPastTotalSupply.returns(
        totalVotingPower
      );
      await governanceErc20Mock.mock.getPastVotes.returns(0);

      expect(
        (
          await voting.createProposal(
            dummyMetadata,
            dummyActions,
            startDate,
            endDate,
            false,
            VoteOption.None
          )
        ).value
      ).to.equal(id);
    });

    it('does not allow voting, when the vote has not started yet', async () => {
      expect(await getTime()).to.be.lessThan(startDate);

      await governanceErc20Mock.mock.getPastVotes.returns(0);

      await expect(voting.vote(id, VoteOption.Yes, false)).to.be.revertedWith(
        customError('VoteCastForbidden', id, signers[0].address)
      );
    });

    it('should not be able to vote if user has 0 token', async () => {
      await advanceTimeTo(startDate);

      await governanceErc20Mock.mock.getPastVotes.returns(0);

      await expect(voting.vote(id, VoteOption.Yes, false)).to.be.revertedWith(
        customError('VoteCastForbidden', id, signers[0].address)
      );
    });

    it('increases the yes, no, abstain votes and emit correct events', async () => {
      await advanceTimeTo(startDate);

      await governanceErc20Mock.mock.getPastVotes.returns(1);

      expect(await voting.vote(id, VoteOption.Yes, false))
        .to.emit(voting, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, signers[0].address, VoteOption.Yes, 1);

      let vote = await voting.getProposal(id);
      expect(vote.yes).to.equal(1);
      expect(vote.no).to.equal(0);
      expect(vote.abstain).to.equal(0);

      expect(await voting.vote(id, VoteOption.No, false))
        .to.emit(voting, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, signers[0].address, VoteOption.No, 1);

      vote = await voting.getProposal(0);
      expect(vote.yes).to.equal(0);
      expect(vote.no).to.equal(1);
      expect(vote.abstain).to.equal(0);

      expect(await voting.vote(id, VoteOption.Abstain, false))
        .to.emit(voting, VOTING_EVENTS.VOTE_CAST)
        .withArgs(id, signers[0].address, VoteOption.Abstain, 1);

      vote = await voting.getProposal(id);
      expect(vote.yes).to.equal(0);
      expect(vote.no).to.equal(0);
      expect(vote.abstain).to.equal(1);
    });

    it('should not double-count votes by the same address', async () => {
      await advanceTimeTo(startDate);

      await governanceErc20Mock.mock.getPastVotes.returns(1);

      // yes still ends up to be 1 here even after voting
      // 2 times from the same wallet.
      await voting.vote(id, VoteOption.Yes, false);
      await voting.vote(id, VoteOption.Yes, false);
      expect((await voting.getProposal(id)).yes).to.equal(1);

      // yes gets removed, no ends up as 1.
      await voting.vote(id, VoteOption.No, false);
      await voting.vote(id, VoteOption.No, false);
      expect((await voting.getProposal(id)).no).to.equal(1);

      // no gets removed, abstain ends up as 1.
      await voting.vote(id, VoteOption.Abstain, false);
      await voting.vote(id, VoteOption.Abstain, false);
      expect((await voting.getProposal(id)).abstain).to.equal(1);
    });

    it('can execute early if participation is large enough', async () => {
      await advanceTimeTo(startDate);

      // vote with 50 yes votes, which is NOT enough to make vote executable as support
      // must be larger than supportThreshold = 50
      await governanceErc20Mock.mock.getPastVotes.returns(50);

      await voting.vote(id, VoteOption.Yes, false);
      expect(await voting.canExecute(id)).to.equal(false);

      // vote with 1 yes vote from another wallet, so that yes votes amount to 51 in total, which is
      // enough to make vote executable as supportThreshold = 50
      await governanceErc20Mock.mock.getPastVotes.returns(1);
      await voting.connect(signers[1]).vote(id, VoteOption.Yes, false);

      expect(await voting.canExecute(id)).to.equal(true);
    });

    it('can execute normally if participation is large enough', async () => {
      await advanceTimeTo(startDate);

      // vote with 50 yes votes
      await governanceErc20Mock.mock.getPastVotes.returns(50);
      await voting.vote(id, VoteOption.Yes, false);

      // vote 30 voting no votes
      await governanceErc20Mock.mock.getPastVotes.returns(30);
      await voting.connect(signers[1]).vote(id, VoteOption.No, false);

      // vote with 10 abstain votes
      await governanceErc20Mock.mock.getPastVotes.returns(10);
      await voting.connect(signers[2]).vote(id, VoteOption.Abstain, false);

      // closes the vote
      await advanceTime(minDuration + 10);

      //The vote is executable as support > 50%, participation > 20%, and the voting period is over
      expect(await voting.canExecute(id)).to.equal(true);
    });

    it('cannot execute normally if participation is too low', async () => {
      await advanceTimeTo(startDate);

      // vote with 10 yes votes
      await governanceErc20Mock.mock.getPastVotes.returns(10);
      await voting.vote(id, VoteOption.Yes, false);

      // vote with 5 no votes
      await governanceErc20Mock.mock.getPastVotes.returns(5);
      await voting.connect(signers[1]).vote(id, VoteOption.No, false);

      // vote with 5 abstain votes
      await governanceErc20Mock.mock.getPastVotes.returns(5);
      await voting.connect(signers[2]).vote(id, VoteOption.Abstain, false);

      // closes the vote
      await advanceTime(minDuration + 10);

      //The vote is not executable because the participation with 20% is still too low, despite a support of 66% and the voting period being over
      expect(await voting.canExecute(id)).to.equal(false);
    });

    it('executes the vote immediately while final yes is given', async () => {
      await advanceTimeTo(startDate);

      // vote with _supportThreshold staking, so
      // it immediatelly executes the vote
      await governanceErc20Mock.mock.getPastVotes.returns(51);

      // supports and should execute right away.
      let tx = await voting.vote(id, VoteOption.Yes, true);

      // check for the `Executed` event in the DAO
      {
        const event = await findEvent(tx, DAO_EVENTS.EXECUTED);

        expect(event.args.actor).to.equal(voting.address);
        expect(event.args.callId).to.equal(id);
        expect(event.args.actions.length).to.equal(1);
        expect(event.args.actions[0].to).to.equal(dummyActions[0].to);
        expect(event.args.actions[0].value).to.equal(dummyActions[0].value);
        expect(event.args.actions[0].data).to.equal(dummyActions[0].data);
        expect(event.args.execResults).to.deep.equal(['0x']);

        const vote = await voting.getProposal(id);

        expect(vote.executed).to.equal(true);
      }

      // check for the `ProposalExecuted` event in the voting contract
      {
        const event = await findEvent(tx, VOTING_EVENTS.PROPOSAL_EXECUTED);

        expect(event.args.proposalId).to.equal(id);
        expect(event.args.execResults).to.deep.equal(['0x']);
      }

      // calling execute again should fail
      await expect(voting.execute(id)).to.be.revertedWith(
        customError('ProposalExecutionForbidden', id)
      );
    });

    it('reverts if vote is not decided yet', async () => {
      await advanceTimeTo(startDate);

      await expect(voting.execute(id)).to.be.revertedWith(
        customError('ProposalExecutionForbidden', id)
      );
    });
  });

  describe('Configurations for different use cases', async () => {
    describe('A simple majority vote with >50% support and >25% participation required', async () => {
      let minDuration = 500;
      let supportThreshold = pct16(50);
      let participationThreshold = pct16(25);
      let totalVotingPower = 100;

      beforeEach(async () => {
        await voting.initialize(
          dao.address,
          participationThreshold,
          supportThreshold,
          minDuration,
          governanceErc20Mock.address
        );

        // set voting power to 100
        await governanceErc20Mock.mock.getPastTotalSupply.returns(
          totalVotingPower
        );
        await governanceErc20Mock.mock.getPastVotes.returns(0);

        await voting.createProposal(
          dummyMetadata,
          dummyActions,
          0,
          0,
          false,
          VoteOption.None
        );
      });

      it('does not execute if support is high enough but relative and participation are too low', async () => {
        await governanceErc20Mock.mock.getPastVotes.returns(10);
        await voting.connect(signers[0]).vote(id, VoteOption.Yes, false);
        // dur | sup | par
        //  0  | 10% | 100%
        //  x  |  x  |  o
        expect(await voting.canExecute(id)).to.equal(false); //  tot

        await advanceTime(minDuration + 10);
        // dur | sup | par
        // 510 | 10% | 100%
        //  o  |  x  |  o
        expect(await voting.canExecute(id)).to.equal(false); // vote end does not help
      });

      it('does not execute if participation is high enough but support is too low', async () => {
        await governanceErc20Mock.mock.getPastVotes.returns(10);
        await voting.connect(signers[0]).vote(id, VoteOption.Yes, false);

        await governanceErc20Mock.mock.getPastVotes.returns(20);
        await voting.connect(signers[1]).vote(id, VoteOption.No, false);
        // dur | sup | par
        //  0  | 30% | 33%
        //  x  |  o  |  x
        expect(await voting.canExecute(id)).to.equal(false); // support (33%) > support threshold (50%) == false

        await advanceTime(minDuration + 10); // waiting until the vote end doesn't change this
        // dur | sup | par
        // 510 | 30% | 33%
        //  o  |  o  |  x
        expect(await voting.canExecute(id)).to.equal(false); // support (33%) > support threshold (50%) == false
      });

      it('executes after the duration if total and support are met', async () => {
        await governanceErc20Mock.mock.getPastVotes.returns(30);
        await voting.connect(signers[0]).vote(id, VoteOption.Yes, false);
        // dur | sup | par
        //  0  | 30% | 100%
        //  x  |  o  |  o
        expect(await voting.canExecute(id)).to.equal(false); // participation (30%) > support threshold (50%) == false, duration is not over

        await advanceTime(minDuration + 10);
        // dur | sup | par
        // 510 | 30% | 100%
        //  o  |  o  |  o
        expect(await voting.canExecute(id)).to.equal(true); // all criteria are met
      });

      it('executes early if the participation exceeds the support threshold (assuming the latter is > 50%)', async () => {
        await governanceErc20Mock.mock.getPastVotes.returns(50);
        await voting.connect(signers[0]).vote(id, VoteOption.Yes, false);
        // dur | sup | par
        //  0  | 50% | 100%
        //  x  |  o  |  o
        expect(await voting.canExecute(id)).to.equal(false); // participation > support threshold == false

        await governanceErc20Mock.mock.getPastVotes.returns(10);
        await voting.connect(signers[1]).vote(id, VoteOption.Yes, false);
        // dur | sup | par
        //  0  | 60% | 100%
        //  x  |  o  |  o
        expect(await voting.canExecute(id)).to.equal(true); // participation (60%) > support threshold (50%) == true

        await governanceErc20Mock.mock.getPastVotes.returns(40);
        await voting.connect(signers[2]).vote(id, VoteOption.No, false);
        // dur | sup | par
        //  0  | 60% | 60%
        //  x  |  o  |  o
        expect(await voting.canExecute(id)).to.equal(true); // The remaining voter voting against it does not change the outcome
      });
    });
  });
});
