// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    EnumerableSet
} from "./openzeppelin/utils/EnumerableSet.sol";
import {Ownable} from "./openzeppelin/access/Ownable.sol";

contract AutoTopUp is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    address payable public immutable gelato;

    EnumerableSet.AddressSet internal _receivers;
    mapping(address => bytes32) public hashes;

    event LogFundsDeposited(address indexed _sender, uint256 _amount);
    event LogFundsWithdrawn(
        address indexed _sender,
        uint256 _amount,
        address _receiver
    );
    event LogTaskSubmitted(
        address indexed _receiver,
        uint256 _amount,
        uint256 _balance
    );
    event LogTaskCancelled(address indexed _receiver, bytes32 _hash);

    constructor(address payable _gelato) {
        gelato = _gelato;
    }

    modifier gelatofy() {
        require(msg.sender == gelato, "AutoTopUp: Only gelato");
        _;
    }

    /// @notice deposit funds
    receive() external payable {
        emit LogFundsDeposited(msg.sender, msg.value);
    }

    /// @notice withdraw fuds
    function withdraw(uint256 _amount, address payable _receiver)
        external
        onlyOwner
    {
        (bool success, ) = _receiver.call{value: _amount}("");
        require(success, "AutoTopUp: exec: Receiver payment failed");

        emit LogFundsWithdrawn(msg.sender, _amount, _receiver);
    }

    /// @notice start an autopay
    function startAutoPay(
        address payable _receiver,
        uint256 _amount,
        uint256 _balanceThreshold
    ) external payable onlyOwner {
        require(
            !_receivers.contains(_receiver),
            "AutoTopUp: startAutoPay: Receiver already assigned"
        );

        require(
            hashes[_receiver] == bytes32(0),
            "AutoTopUp: startAutoPay: Hash already assigned"
        );

        _receivers.add(_receiver);

        hashes[_receiver] = keccak256(abi.encode(_amount, _balanceThreshold));

        LogTaskSubmitted(_receiver, _amount, _balanceThreshold);
    }

    /// @notice stop an autopay
    function stopAutoPay(address payable _receiver) external onlyOwner {
        require(
            _receivers.contains(_receiver),
            "AutoTopUp: stopAutoPay: Invalid Autopay"
        );

        bytes32 storedHash = hashes[_receiver];

        require(
            storedHash != bytes32(0),
            "AutoTopUp: stopAutoPay: Hash not found"
        );

        // store receiver
        _receivers.remove(_receiver);

        delete hashes[_receiver];

        LogTaskCancelled(_receiver, storedHash);
    }

    /// @dev entry point for gelato executiom
    /// @notice overcharging is prevented on Gelato.sol
    function exec(
        address payable _receiver,
        uint256 _amount,
        uint256 _balanceThreshold,
        uint256 _fee
    ) external gelatofy {
        bytes32 topUpHash = keccak256(abi.encode(_amount, _balanceThreshold));
        require(
            hashes[_receiver] == topUpHash,
            "AutoTopUp: exec: Hash invalid"
        );
        require(
            _receiver.balance <= _balanceThreshold,
            "AutoTopUp: exec: Balance not below threshold"
        );

        bool success;
        (success, ) = _receiver.call{value: _amount}("");
        require(success, "AutoTopUp: exec: Receiver payment failed");

        (success, ) = gelato.call{value: _fee}("");
        require(success, "AutoTopUp: exec: Receiver payment failed");
    }

    /// @notice Get all receivers
    /// @dev useful to query which autoPays to cancel
    function getReceivers()
        external
        view
        returns (address[] memory currentReceivers)
    {
        uint256 length = _receivers.length();
        currentReceivers = new address[](length);
        for (uint256 i; i < length; i++) currentReceivers[i] = _receivers.at(i);
    }
}
