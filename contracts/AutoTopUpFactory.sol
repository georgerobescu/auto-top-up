// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {EnumerableSet} from "./openzeppelin/utils/EnumerableSet.sol";
import {AutoTopUp} from "./AutoTopUp.sol";

contract AutoTopUpFactory {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(address => AutoTopUp) public autoTopUpByOwner;
    mapping(AutoTopUp => address) public ownerByAutoTopUp;

    EnumerableSet.AddressSet internal _autoTopUps;

    event LogContractDeployed(address indexed autoTopUp, address owner);

    address payable public immutable gelato;

    constructor(address payable _gelato) {
        gelato = _gelato;
    }

    function newAutoTopUp(
        address payable _receiver,
        uint256 _amount,
        uint256 _balanceThreshold
    ) external payable returns (AutoTopUp autoTopUp) {
        require(autoTopUpByOwner[msg.sender] == AutoTopUp(payable(address(0))));

        autoTopUp = new AutoTopUp(gelato);
        autoTopUp.startAutoPay{value: msg.value}(
            _receiver,
            _amount,
            _balanceThreshold
        );
        autoTopUp.transferOwnership(msg.sender);

        autoTopUpByOwner[msg.sender] = autoTopUp;
        ownerByAutoTopUp[autoTopUp] = msg.sender;
        _autoTopUps.add(address(autoTopUp));

        emit LogContractDeployed(address(autoTopUp), msg.sender);
    }

    /// @notice Get all autoTopUps
    /// @dev useful to query which autoTopUps to cancel
    function getAutoTopUps()
        external
        view
        returns (address[] memory currentAutoTopUps)
    {
        uint256 length = _autoTopUps.length();
        currentAutoTopUps = new address[](length);
        for (uint256 i; i < length; i++)
            currentAutoTopUps[i] = _autoTopUps.at(i);
    }
}
