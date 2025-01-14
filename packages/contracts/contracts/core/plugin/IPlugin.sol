// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/// @title IPlugin
/// @author Aragon Association - 2022
/// @notice An interface defining the traits of a plugin.
interface IPlugin {
    enum PluginType {
        UUPS,
        Cloneable,
        Constructable
    }

    /// @notice returns the plugin's type
    function pluginType() external view returns (PluginType);
}
