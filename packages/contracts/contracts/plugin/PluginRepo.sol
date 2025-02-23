// SPDX-License-Identifier:    MIT

pragma solidity 0.8.10;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AddressUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import {PermissionManager} from "../core/permission/PermissionManager.sol";
import {_uncheckedIncrement} from "../utils/UncheckedMath.sol";
import {PluginSetup} from "./PluginSetup.sol";
import {IPluginSetup} from "./PluginSetup.sol";
import {IPluginRepo} from "./IPluginRepo.sol";
import {isValidBumpStrict, BumpInvalid} from "./SemanticVersioning.sol";

/// @title PluginRepo
/// @author Aragon Association - 2020 - 2022
/// @notice The plugin repository contract required for managing and publishing different plugin versions within the Aragon DAO framework following the [Semantic Versioning 2.0.0](https://semver.org/) convention.
//TODO Rename to PluginSetupRepo?
contract PluginRepo is
    Initializable,
    ERC165Upgradeable,
    IPluginRepo,
    UUPSUpgradeable,
    PermissionManager
{
    using AddressUpgradeable for address;

    struct Version {
        uint16[3] semanticVersion;
        address pluginSetup;
        bytes contentURI;
    }

    /// @notice The ID of the permission required to call the `createVersion` function.
    bytes32 public constant CREATE_VERSION_PERMISSION_ID = keccak256("CREATE_VERSION_PERMISSION");

    /// @notice The ID of the permission required to call the `createVersion` function.
    bytes32 public constant UPGRADE_REPO_PERMISSION_ID = keccak256("UPGRADE_REPO_PERMISSION");

    /// @notice The index of the next version to be created.
    uint256 internal nextVersionIndex;

    /// @notice The mapping between version indices and version information.
    mapping(uint256 => Version) internal versions;

    /// @notice A mapping between the semantic version number hash and the version index.
    mapping(bytes32 => uint256) internal versionIndexForSemantic;

    /// @notice A mapping between the `PluginSetup` contract addresses and the version index.
    mapping(address => uint256) internal versionIndexForPluginSetup;

    /// @notice Thrown if version does not exist.
    /// @param versionIndex The index of the version.
    error VersionIndexDoesNotExist(uint256 versionIndex);

    /// @notice Thrown if a contract does not inherit from `PluginSetup`.
    /// @param invalidPluginSetup The address of the contract missing the `PluginSetup` interface.
    error InvalidPluginSetupInterface(address invalidPluginSetup);

    /// @notice Thrown if a contract is not a `PluginSetup` contract.
    /// @param invalidPluginSetup The address of the contract not being a plugin factory.
    error InvalidPluginSetupContract(address invalidPluginSetup);

    /// @notice Thrown if address is not a contract.
    /// @param invalidContract The address not being a contract.
    error InvalidContractAddress(address invalidContract);

    /// @notice Emitted when a new version is created.
    /// @param versionId The version index.
    /// @param semanticVersion The semantic version number.
    /// @param pluginSetup The address of the plugin setup contract.
    /// @param contentURI External URI where the plugin metadata and subsequent resources can be fetched from
    event VersionCreated(
        uint256 versionId,
        uint16[3] semanticVersion,
        address indexed pluginSetup,
        bytes contentURI
    );

    /// @dev Used to disallow initializing the implementation contract by an attacker for extra safety.
    constructor() {
        _disableInitializers();
    }
    
    /// @notice Initializes the contract by
    /// - registering the [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID
    /// - initializing the permission manager
    /// - setting the next version index to 1 and
    /// - giving the `CREATE_VERSION_PERMISSION_ID` permission to the initial owner.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    function initialize(address initialOwner) external initializer {
        __PermissionManager_init(initialOwner);

        nextVersionIndex = 1;

        // set permissionIds.
        _grant(address(this), initialOwner, CREATE_VERSION_PERMISSION_ID);
    }

    /// @inheritdoc IPluginRepo
    function createVersion(
        uint16[3] memory _newSemanticVersion,
        address _pluginSetup,
        bytes calldata _contentURI
    ) external auth(address(this), CREATE_VERSION_PERMISSION_ID) {
        // In a case where _pluginSetup doesn't contain supportsInterface,
        // but contains fallback, that doesn't return anything(most cases)
        // the below approach aims to still return custom error which not possible with try/catch..
        // NOTE: also checks if _pluginSetup is a contract and reverts if not.
        bytes memory data = _pluginSetup.functionCall(
            abi.encodeWithSelector(
                ERC165Upgradeable.supportsInterface.selector,
                type(IPluginSetup).interfaceId
            )
        );

        // NOTE: if data contains 32 bytes that can't be decoded with uint256
        // it reverts with solidity's ambigious error.
        if (data.length != 32 || abi.decode(data, (uint256)) != 1) {
            revert InvalidPluginSetupInterface({invalidPluginSetup: _pluginSetup});
        }

        uint256 currentVersionIndex = nextVersionIndex - 1;

        uint16[3] memory currentSemanticVersion;

        if (currentVersionIndex > 0) {
            Version storage currentVersion = versions[currentVersionIndex];
            currentSemanticVersion = currentVersion.semanticVersion;
        }

        if (!isValidBumpStrict(currentSemanticVersion, _newSemanticVersion)) {
            revert BumpInvalid({
                currentVersion: currentSemanticVersion,
                nextVersion: _newSemanticVersion
            });
        }

        uint256 versionIndex = nextVersionIndex;
        nextVersionIndex = _uncheckedIncrement(nextVersionIndex);
        versions[versionIndex] = Version(_newSemanticVersion, _pluginSetup, _contentURI);
        versionIndexForSemantic[_semanticVersionHash(_newSemanticVersion)] = versionIndex;
        versionIndexForPluginSetup[_pluginSetup] = versionIndex;

        emit VersionCreated(versionIndex, _newSemanticVersion, _pluginSetup, _contentURI);
    }

    /// @notice Gets the version information of the latest version.
    /// @return semanticVersion The semantic version number.
    /// @return pluginSetup The address of the plugin factory associated with the version.
    /// @return contentURI The external URI pointing to the content of the version.
    function getLatestVersion()
        public
        view
        returns (
            uint16[3] memory semanticVersion,
            address pluginSetup,
            bytes memory contentURI
        )
    {
        return getVersionById(nextVersionIndex - 1);
    }

    /// @notice Gets the version information associated with a plugin factory address.
    /// @return semanticVersion The semantic version number.
    /// @return pluginSetup The address of the plugin factory associated with the version.
    /// @return contentURI The external URI pointing to the content of the version.
    function getVersionByPluginSetup(address _pluginSetup)
        public
        view
        returns (
            uint16[3] memory semanticVersion,
            address pluginSetup,
            bytes memory contentURI
        )
    {
        return getVersionById(versionIndexForPluginSetup[_pluginSetup]);
    }

    /// @notice Gets the version information associated with a semantic version number.
    /// @return semanticVersion The semantic version number.
    /// @return pluginSetup The address of the plugin factory associated with the version.
    /// @return contentURI The external URI pointing to the content of the version.
    function getVersionBySemanticVersion(uint16[3] memory _semanticVersion)
        public
        view
        returns (
            uint16[3] memory semanticVersion,
            address pluginSetup,
            bytes memory contentURI
        )
    {
        return getVersionById(versionIndexForSemantic[_semanticVersionHash(_semanticVersion)]);
    }

    /// @notice Gets the version information associated with a version index.
    /// @return semanticVersion The semantic version number.
    /// @return pluginSetup The address of the plugin factory associated with the version.
    /// @return contentURI The external URI pointing to the content of the version.
    function getVersionById(uint256 _versionIndex)
        public
        view
        returns (
            uint16[3] memory semanticVersion,
            address pluginSetup,
            bytes memory contentURI
        )
    {
        if (_versionIndex <= 0 || _versionIndex >= nextVersionIndex)
            revert VersionIndexDoesNotExist({versionIndex: _versionIndex});
        Version storage version = versions[_versionIndex];
        return (version.semanticVersion, version.pluginSetup, version.contentURI);
    }

    /// @notice Gets the total number of published versions.
    /// @return uint256 The number of published versions.
    function getVersionCount() public view returns (uint256) {
        return nextVersionIndex - 1;
    }

    /// @notice Generates a hash from a semantic version number.
    /// @param semanticVersion The semantic version number.
    /// @return bytes32 The hash of the semantic version number.
    function _semanticVersionHash(uint16[3] memory semanticVersion) internal pure returns (bytes32) {
        return
            keccak256(abi.encodePacked(semanticVersion[0], semanticVersion[1], semanticVersion[2]));
    }

    /// @notice Internal method authorizing the upgrade of the contract via the [upgradeabilty mechanism for UUPS proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable) (see [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822)).
    /// @dev The caller must have the `UPGRADE_REPO_PERMISSION_ID` permission.
    function _authorizeUpgrade(address)
        internal
        virtual
        override
        auth(address(this), UPGRADE_REPO_PERMISSION_ID)
    {}

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param interfaceId The ID of the interface.
    /// @return bool Returns `true` if the interface is supported.
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IPluginRepo).interfaceId ||
            interfaceId == type(UUPSUpgradeable).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
