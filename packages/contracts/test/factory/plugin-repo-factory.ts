import {expect} from 'chai';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {ethers} from 'hardhat';

import {
  deployMockPluginSetup,
  deployPluginRepoRegistry,
} from '../test-utils/repo';
import {deployENSSubdomainRegistrar} from '../test-utils/ens';
import {deployNewDAO} from '../test-utils/dao';

import {PluginRepoRegistry, DAO} from '../../typechain';
import {getMergedABI} from '../../utils/abi';

const EVENTS = {
  PluginRepoRegistered: 'PluginRepoRegistered',
};

const REGISTER_PLUGIN_REPO_PERMISSION_ID = ethers.utils.id(
  'REGISTER_PLUGIN_REPO_PERMISSION'
);

const REGISTER_ENS_SUBDOMAIN_PERMISSION_ID = ethers.utils.id(
  'REGISTER_ENS_SUBDOMAIN_PERMISSION'
);

async function getPluginRepoRegistryEvents(tx: any) {
  const data = await tx.wait();
  const {events} = data;
  const {name, pluginRepo} = events.find(
    ({event}: {event: any}) => event === EVENTS.PluginRepoRegistered
  ).args;

  return {
    name,
    pluginRepo,
  };
}

describe('PluginRepoFactory: ', function () {
  let signers: SignerWithAddress[];
  let pluginRepoRegistry: PluginRepoRegistry;
  let ownerAddress: string;
  let managingDao: DAO;
  let pluginRepoFactory: any;

  let mergedABI: any;
  let pluginRepoFactoryBytecode: any;

  before(async () => {
    signers = await ethers.getSigners();
    ownerAddress = await signers[0].getAddress();

    const {abi, bytecode} = await getMergedABI(
      // @ts-ignore
      hre,
      'PluginRepoFactory',
      ['PluginRepoRegistry']
    );

    mergedABI = abi;
    pluginRepoFactoryBytecode = bytecode;
  });

  beforeEach(async function () {
    // DAO
    managingDao = await deployNewDAO(ownerAddress);

    // ENS subdomain Registry
    const ensSubdomainRegistrar = await deployENSSubdomainRegistrar(
      signers[0],
      managingDao,
      'dao.eth'
    );

    // deploy and initialize PluginRepoRegistry
    pluginRepoRegistry = await deployPluginRepoRegistry(
      managingDao,
      ensSubdomainRegistrar
    );

    // deploy PluginRepoFactory
    const PluginRepoFactory = new ethers.ContractFactory(
      mergedABI,
      pluginRepoFactoryBytecode,
      signers[0]
    );
    pluginRepoFactory = await PluginRepoFactory.deploy(
      pluginRepoRegistry.address
    );

    // grant REGISTER_PERMISSION_ID to pluginRepoFactory
    await managingDao.grant(
      pluginRepoRegistry.address,
      pluginRepoFactory.address,
      REGISTER_PLUGIN_REPO_PERMISSION_ID
    );

    // grant REGISTER_PERMISSION_ID to pluginRepoFactory
    await managingDao.grant(
      ensSubdomainRegistrar.address,
      pluginRepoRegistry.address,
      REGISTER_ENS_SUBDOMAIN_PERMISSION_ID
    );
  });

  it('fail to create new pluginRepo with no PLUGIN_REGISTER_PERMISSION', async () => {
    await managingDao.revoke(
      pluginRepoRegistry.address,
      pluginRepoFactory.address,
      REGISTER_PLUGIN_REPO_PERMISSION_ID
    );

    const pluginRepoName = 'my-pluginRepo';

    await expect(
      pluginRepoFactory.createPluginRepo(pluginRepoName, ownerAddress)
    )
      .to.be.revertedWithCustomError(pluginRepoRegistry, 'DaoUnauthorized')
      .withArgs(
        managingDao.address,
        pluginRepoRegistry.address,
        pluginRepoRegistry.address,
        pluginRepoFactory.address,
        REGISTER_PLUGIN_REPO_PERMISSION_ID
      );
  });

  it('fail to create new pluginRepo with empty name', async () => {
    const pluginRepoName = '';

    await expect(
      pluginRepoFactory.createPluginRepo(pluginRepoName, ownerAddress)
    ).to.be.revertedWithCustomError(pluginRepoFactory, 'EmptyPluginRepoName');
  });

  it('create new pluginRepo', async () => {
    const pluginRepoName = 'my-pluginRepo';

    let tx = await pluginRepoFactory.createPluginRepo(
      pluginRepoName,
      ownerAddress
    );

    const {name, pluginRepo} = await getPluginRepoRegistryEvents(tx);

    expect(name).to.equal(pluginRepoName);
    expect(pluginRepo).not.undefined;
  });

  it('fail creating new pluginRepo with wrong major version', async () => {
    const pluginSetupMock = await deployMockPluginSetup();

    const pluginRepoName = 'my-pluginRepo';
    const wrongInitialSemanticVersion = [0, 0, 0];
    const pluginSetupAddress = pluginSetupMock.address;
    const contentURI = '0x00';

    // Get the contract to be deployed by calling `createPluginRepoWithVersion` with `callStatic`

    const PluginRepo = await ethers.getContractFactory('PluginRepo');
    const pluginRepoToBeCreated = PluginRepo.attach(
      pluginRepoFactory.callStatic.createPluginRepoWithVersion(
        pluginRepoName,
        [1, 0, 0],
        pluginSetupAddress,
        contentURI,
        ownerAddress
      )
    );

    await expect(
      pluginRepoFactory.createPluginRepoWithVersion(
        pluginRepoName,
        wrongInitialSemanticVersion,
        pluginSetupAddress,
        contentURI,
        ownerAddress
      )
    )
      .to.be.revertedWithCustomError(pluginRepoToBeCreated, 'BumpInvalid')
      .withArgs([0, 0, 0], [0, 0, 0]);
  });

  it('create new pluginRepo with version', async () => {
    const pluginSetupMock = await deployMockPluginSetup();

    const pluginRepoName = 'my-pluginRepo';
    const initialSemanticVersion = [1, 0, 0];
    const pluginSetupAddress = pluginSetupMock.address;
    const contentURI = '0x00';

    let tx = await pluginRepoFactory.createPluginRepoWithVersion(
      pluginRepoName,
      initialSemanticVersion,
      pluginSetupAddress,
      contentURI,
      ownerAddress
    );

    const {name, pluginRepo} = await getPluginRepoRegistryEvents(tx);

    expect(name).to.equal(pluginRepoName);
    expect(pluginRepo).not.undefined;
  });
});
