// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CCTPSender.sol";
import "../src/CCTPReceiver.sol";
import "../src/Registry.sol";
import "../src/PythiaVault.sol";
import "../src/PythiaVaultFactory.sol";
import "../src/SlashingArbiter.sol";
import "../src/MockPredictionMarket.sol";
import "../src/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Mock TokenMessenger (does NOT actually move USDC — simulates the CCTP burn)
// ---------------------------------------------------------------------------
contract MockTokenMessenger {
    uint64  public lastNonce;
    uint256 public callCount;

    function depositForBurnWithCaller(
        uint256, /* amount */
        uint32,  /* destinationDomain */
        bytes32, /* mintRecipient */
        address, /* burnToken */
        bytes32  /* destinationCaller */
    ) external returns (uint64 nonce) {
        callCount++;
        lastNonce = uint64(callCount);
        return lastNonce;
    }
}

// ===========================================================================
//  CCTPSenderTest
// ===========================================================================
contract CCTPSenderTest is Test {
    MockUSDC           usdc;
    MockTokenMessenger messenger;
    CCTPSender         sender;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    // We don't need a real CCTPReceiver address for sender tests.
    // Use a placeholder converted to bytes32.
    bytes32 constant ARC_RECEIVER = bytes32(uint256(uint160(address(0xCCCC))));
    uint32  constant ARC_DOMAIN   = 9;

    function setUp() public {
        usdc      = new MockUSDC();
        messenger = new MockTokenMessenger();
        sender    = new CCTPSender(address(messenger), address(usdc), ARC_RECEIVER, ARC_DOMAIN);

        // Fund alice
        usdc.faucet(1_000_000e6);
        usdc.transfer(alice, 1_000e6);
    }

    // -----------------------------------------------------------------------
    // 1. Happy path
    // -----------------------------------------------------------------------
    function test_stakeRemote_happyPath() public {
        bytes32 nameHash = keccak256("apollo");
        uint256 amount   = 100e6;

        vm.startPrank(alice);
        usdc.approve(address(sender), amount);
        uint64 nonce = sender.stakeRemote(nameHash, bob, amount);
        vm.stopPrank();

        // MockTokenMessenger increments callCount and returns it as nonce.
        assertEq(messenger.callCount(), 1, "callCount should be 1");
        assertEq(nonce, 1, "returned nonce should be 1");
        assertEq(messenger.lastNonce(), 1, "lastNonce should be 1");

        // Alice's balance decreased by 100e6.
        assertEq(usdc.balanceOf(alice), 900e6, "alice balance should decrease by 100e6");

        // CCTPSender holds the USDC because MockTokenMessenger doesn't actually
        // burn it. The real TokenMessenger would burn; here we confirm the USDC
        // left alice and sits in the sender contract.
        assertEq(usdc.balanceOf(address(sender)), amount, "sender should hold USDC");
    }

    // -----------------------------------------------------------------------
    // 2. Event emission
    // -----------------------------------------------------------------------
    function test_stakeRemote_emitsEvent() public {
        bytes32 nameHash = keccak256("apollo");
        uint256 amount   = 100e6;

        vm.startPrank(alice);
        usdc.approve(address(sender), amount);

        vm.expectEmit(true, true, false, true);
        emit CCTPSender.StakeRemoteInitiated(nameHash, bob, amount, 1);

        sender.stakeRemote(nameHash, bob, amount);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 3. Reverts when caller has not approved USDC
    // -----------------------------------------------------------------------
    function test_stakeRemote_revertsIfNoApproval() public {
        bytes32 nameHash = keccak256("apollo");

        vm.prank(alice);
        // No prior approval — ERC20 should revert with insufficient allowance.
        vm.expectRevert();
        sender.stakeRemote(nameHash, bob, 100e6);
    }

    // -----------------------------------------------------------------------
    // 4. Reverts when caller has insufficient balance
    // -----------------------------------------------------------------------
    function test_stakeRemote_revertsIfInsufficientBalance() public {
        bytes32 nameHash = keccak256("apollo");
        uint256 tooMuch  = 10_000e6; // alice only has 1_000e6

        vm.startPrank(alice);
        usdc.approve(address(sender), tooMuch);
        vm.expectRevert();
        sender.stakeRemote(nameHash, bob, tooMuch);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 5. Multiple sequential calls increment nonce correctly
    // -----------------------------------------------------------------------
    function test_stakeRemote_multipleCallsIncrementNonce() public {
        bytes32 nameHash = keccak256("apollo");

        vm.startPrank(alice);
        usdc.approve(address(sender), 300e6);
        uint64 n1 = sender.stakeRemote(nameHash, bob, 50e6);
        uint64 n2 = sender.stakeRemote(nameHash, bob, 50e6);
        uint64 n3 = sender.stakeRemote(nameHash, bob, 50e6);
        vm.stopPrank();

        assertEq(n1, 1, "first nonce");
        assertEq(n2, 2, "second nonce");
        assertEq(n3, 3, "third nonce");
        assertEq(messenger.callCount(), 3, "three calls to tokenMessenger");
    }

    // -----------------------------------------------------------------------
    // 6. Immutables are set correctly at construction
    // -----------------------------------------------------------------------
    function test_immutables_setCorrectly() public view {
        assertEq(address(sender.tokenMessenger()), address(messenger));
        assertEq(address(sender.usdc()), address(usdc));
        assertEq(sender.arcReceiver(), ARC_RECEIVER);
        assertEq(sender.arcDomain(), ARC_DOMAIN);
    }
}

// ===========================================================================
//  CCTPReceiverTest
// ===========================================================================
contract CCTPReceiverTest is Test {
    MockUSDC            usdc;
    MockPredictionMarket market;
    Registry            registry;
    SlashingArbiter     arbiter;
    PythiaVaultFactory  factory;
    CCTPReceiver        receiver;

    address owner       = address(0xA110);
    address daemon      = address(0xDAE1);
    address staker      = address(0xB0B1);
    address transmitter = address(0xBEEF);
    address nonOwner    = address(0xBAD);

    uint256 internal automationPk = 0xA0701;
    uint256 internal validatorPk  = 0xA0702;
    address automation;
    address validator;

    bytes32 apolloNameHash;
    address vaultAddr;

    function setUp() public {
        automation = vm.addr(automationPk);
        validator  = vm.addr(validatorPk);

        usdc    = new MockUSDC();
        market  = new MockPredictionMarket(address(usdc));
        registry = new Registry(address(this));
        arbiter = new SlashingArbiter(address(registry), automation, validator);
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();
        factory  = new PythiaVaultFactory(address(registry), address(usdc), address(arbiter), address(market));

        // Deploy CCTPReceiver
        receiver = new CCTPReceiver(address(registry), address(usdc), transmitter);

        // Register Apollo Pythia
        usdc.faucet(10_000_000e6);
        usdc.transfer(owner, 100_000e6);

        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, apolloNameHash) = factory.createPythia(
            "apollo", daemon, address(0),
            keccak256("MANIFEST"), keccak256("MANDATE"),
            500e6, 2_000e6
        );
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // 1. Happy path: handleReceiveMessage stakes on behalf of staker
    // -----------------------------------------------------------------------
    function test_handleReceiveMessage_happyPath() public {
        uint256 amount = 100e6;

        // Simulate Circle minting USDC to CCTPReceiver (as if the cross-chain
        // message was attested and the mint happened).
        usdc.transfer(address(receiver), amount);

        bytes memory messageBody = abi.encode(apolloNameHash, staker, amount);

        vm.prank(transmitter);
        vm.expectEmit(true, true, false, true);
        emit CCTPReceiver.CrossChainStake(apolloNameHash, staker, amount, 3);

        bool ok = receiver.handleReceiveMessage(3, bytes32(0), messageBody);

        assertTrue(ok, "handleReceiveMessage should return true");

        // Staker should have received PYT shares from the vault.
        PythiaVault vault = PythiaVault(vaultAddr);
        assertGt(vault.balanceOf(staker), 0, "staker should have PYT shares");

        // Receiver should hold no PYT shares (all forwarded to staker).
        assertEq(vault.balanceOf(address(receiver)), 0, "receiver should hold no PYT shares");
    }

    // -----------------------------------------------------------------------
    // 2. Reverts when caller is not the transmitter
    // -----------------------------------------------------------------------
    function test_handleReceiveMessage_revertsIfCallerNotTransmitter() public {
        bytes memory messageBody = abi.encode(apolloNameHash, staker, 100e6);

        vm.prank(nonOwner);
        vm.expectRevert(CCTPReceiver.CallerNotTransmitter.selector);
        receiver.handleReceiveMessage(3, bytes32(0), messageBody);
    }

    // -----------------------------------------------------------------------
    // 3. Reverts when vault not found (unknown nameHash)
    // -----------------------------------------------------------------------
    function test_handleReceiveMessage_revertsIfVaultNotFound() public {
        bytes32 unknownNameHash = keccak256("nonexistent-pythia");
        bytes memory messageBody = abi.encode(unknownNameHash, staker, 100e6);

        // Mint some USDC so it doesn't fail for balance reasons
        usdc.transfer(address(receiver), 100e6);

        vm.prank(transmitter);
        vm.expectRevert(CCTPReceiver.VaultNotFound.selector);
        receiver.handleReceiveMessage(3, bytes32(0), messageBody);
    }

    // -----------------------------------------------------------------------
    // 4. Owner can update the message transmitter
    // -----------------------------------------------------------------------
    function test_setMessageTransmitter_byOwner() public {
        address newTransmitter = address(0x1234);

        // Owner sets a new transmitter.
        receiver.setMessageTransmitter(newTransmitter);
        assertEq(receiver.messageTransmitter(), newTransmitter, "transmitter should be updated");

        // Old transmitter can no longer call handleReceiveMessage.
        bytes memory messageBody = abi.encode(apolloNameHash, staker, 100e6);
        vm.prank(transmitter);
        vm.expectRevert(CCTPReceiver.CallerNotTransmitter.selector);
        receiver.handleReceiveMessage(3, bytes32(0), messageBody);

        // New transmitter can call.
        usdc.transfer(address(receiver), 100e6);
        vm.prank(newTransmitter);
        bool ok = receiver.handleReceiveMessage(3, bytes32(0), messageBody);
        assertTrue(ok, "new transmitter should be able to call");
    }

    // -----------------------------------------------------------------------
    // 5. Non-owner cannot set the message transmitter
    // -----------------------------------------------------------------------
    function test_setMessageTransmitter_revertsForNonOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert();  // OwnableUnauthorizedAccount
        receiver.setMessageTransmitter(address(0x9999));
    }

    // -----------------------------------------------------------------------
    // 6. Constructor sets initial state correctly
    // -----------------------------------------------------------------------
    function test_constructor_setsState() public view {
        assertEq(address(receiver.registry()), address(registry));
        assertEq(address(receiver.usdc()), address(usdc));
        assertEq(receiver.messageTransmitter(), transmitter);
    }

    // -----------------------------------------------------------------------
    // 7. CrossChainStake event carries correct sourceDomain
    // -----------------------------------------------------------------------
    function test_handleReceiveMessage_sourcedomainInEvent() public {
        uint32  srcDomain  = 7; // arbitrary source chain domain
        uint256 amount     = 50e6;
        bytes memory messageBody = abi.encode(apolloNameHash, staker, amount);

        usdc.transfer(address(receiver), amount);

        vm.prank(transmitter);
        vm.expectEmit(true, true, false, true);
        emit CCTPReceiver.CrossChainStake(apolloNameHash, staker, amount, srcDomain);

        receiver.handleReceiveMessage(srcDomain, bytes32(0), messageBody);
    }
}

// ===========================================================================
//  CCTPRoundTripTest  (integration)
// ===========================================================================
contract CCTPRoundTripTest is Test {
    MockUSDC            usdc;
    MockPredictionMarket market;
    Registry            registry;
    SlashingArbiter     arbiter;
    PythiaVaultFactory  factory;
    MockTokenMessenger  messenger;
    CCTPSender          senderContract;
    CCTPReceiver        receiverContract;

    address owner       = address(0xA110);
    address daemon      = address(0xDAE1);
    address alice       = address(0xA11CE);
    address transmitter = address(0xBEEF);

    uint32  constant ARC_DOMAIN = 9;

    uint256 internal automationPk = 0xA0701;
    uint256 internal validatorPk  = 0xA0702;
    address automation;
    address validator;

    bytes32 apolloNameHash;
    address vaultAddr;

    function setUp() public {
        automation = vm.addr(automationPk);
        validator  = vm.addr(validatorPk);

        usdc   = new MockUSDC();
        market = new MockPredictionMarket(address(usdc));

        // Registry + arbiter
        registry = new Registry(address(this));
        arbiter  = new SlashingArbiter(address(registry), automation, validator);
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();
        factory = new PythiaVaultFactory(address(registry), address(usdc), address(arbiter), address(market));

        // Deploy CCTP contracts
        messenger        = new MockTokenMessenger();
        receiverContract = new CCTPReceiver(address(registry), address(usdc), transmitter);
        senderContract   = new CCTPSender(
            address(messenger),
            address(usdc),
            bytes32(uint256(uint160(address(receiverContract)))),
            ARC_DOMAIN
        );

        // Seed USDC
        usdc.faucet(10_000_000e6);
        usdc.transfer(owner, 100_000e6);
        usdc.transfer(alice, 10_000e6);

        // Register Apollo Pythia
        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, apolloNameHash) = factory.createPythia(
            "apollo", daemon, address(0),
            keccak256("MANIFEST"), keccak256("MANDATE"),
            500e6, 2_000e6
        );
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // Full round-trip: send on source chain → relayer delivers → stake on Arc
    // -----------------------------------------------------------------------
    function test_roundTrip() public {
        uint256 amount = 100e6;

        // --- Source chain: alice initiates cross-chain stake ---
        vm.startPrank(alice);
        usdc.approve(address(senderContract), amount);

        vm.expectEmit(true, true, false, true);
        emit CCTPSender.StakeRemoteInitiated(apolloNameHash, alice, amount, 1);

        uint64 nonce = senderContract.stakeRemote(apolloNameHash, alice, amount);
        vm.stopPrank();

        assertEq(nonce, 1, "nonce from stakeRemote");
        assertEq(messenger.callCount(), 1, "tokenMessenger called once");

        // --- Off-chain relayer: Circle attests and delivers message ---
        // In production the MessageTransmitter would mint USDC to CCTPReceiver.
        // In the test we simulate this by transferring USDC directly.
        usdc.transfer(address(receiverContract), amount);

        bytes memory messageBody = abi.encode(apolloNameHash, alice, amount);

        vm.prank(transmitter);
        vm.expectEmit(true, true, false, true);
        emit CCTPReceiver.CrossChainStake(apolloNameHash, alice, amount, 3);

        bool ok = receiverContract.handleReceiveMessage(3, bytes32(0), messageBody);

        assertTrue(ok, "handleReceiveMessage should succeed");

        // --- Verify alice holds PYT shares on Arc ---
        PythiaVault vault = PythiaVault(vaultAddr);
        assertGt(vault.balanceOf(alice), 0, "alice should have PYT shares after round-trip");

        // Receiver holds no residual PYT.
        assertEq(vault.balanceOf(address(receiverContract)), 0, "receiver holds no PYT shares");

        // Receiver holds no residual USDC (all staked).
        assertEq(usdc.balanceOf(address(receiverContract)), 0, "receiver holds no USDC after staking");
    }

    // -----------------------------------------------------------------------
    // Round-trip with a different source domain
    // -----------------------------------------------------------------------
    function test_roundTrip_differentSourceDomain() public {
        uint32  srcDomain = 6; // e.g. Arbitrum
        uint256 amount    = 200e6;

        vm.startPrank(alice);
        usdc.approve(address(senderContract), amount);
        senderContract.stakeRemote(apolloNameHash, alice, amount);
        vm.stopPrank();

        usdc.transfer(address(receiverContract), amount);

        bytes memory messageBody = abi.encode(apolloNameHash, alice, amount);

        vm.prank(transmitter);
        vm.expectEmit(true, true, false, true);
        emit CCTPReceiver.CrossChainStake(apolloNameHash, alice, amount, srcDomain);

        bool ok = receiverContract.handleReceiveMessage(srcDomain, bytes32(0), messageBody);
        assertTrue(ok);

        PythiaVault vault = PythiaVault(vaultAddr);
        assertGt(vault.balanceOf(alice), 0, "alice has shares after Arbitrum round-trip");
    }

    // -----------------------------------------------------------------------
    // Sender's arcReceiver matches receiver contract address
    // -----------------------------------------------------------------------
    function test_senderArcReceiver_matchesReceiverAddress() public view {
        bytes32 expected = bytes32(uint256(uint160(address(receiverContract))));
        assertEq(senderContract.arcReceiver(), expected, "arcReceiver encoding correct");
    }
}
