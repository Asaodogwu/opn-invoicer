// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title OPNInvoicer
 * @author OPN Builder — Season 6
 * @notice On-chain invoice creation and payment tracking on OPN Chain
 * @dev Deployed on OPN Chain (Chain ID: 984). EVM-compatible, gas-optimised.
 */
contract OPNInvoicer {

    // ─────────────────────────────────────────────
    //  TYPES
    // ─────────────────────────────────────────────

    enum Status { Draft, Sent, Paid, Overdue, Cancelled }

    struct Invoice {
        uint256 id;
        address payable creator;   // freelancer / business owner
        address payer;             // client wallet address
        uint256 amountWei;         // invoice amount in OPN (wei)
        uint256 createdAt;
        uint256 dueDate;
        Status  status;
        string  description;       // e.g. "Web design — May 2026"
        string  clientName;
    }

    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────

    uint256 private _nextId = 1;
    uint256 public  platformFeeBps = 50; // 0.5% platform fee (basis points)
    address public  owner;

    mapping(uint256 => Invoice) public invoices;

    // creator → list of invoice IDs they own
    mapping(address => uint256[]) private _creatorInvoices;
    // payer → list of invoice IDs they owe
    mapping(address => uint256[]) private _payerInvoices;

    uint256 public totalPlatformFees;

    // ─────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────

    event InvoiceCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed payer,
        uint256 amount,
        uint256 dueDate
    );

    event InvoicePaid(
        uint256 indexed id,
        address indexed payer,
        uint256 amountPaid,
        uint256 fee,
        uint256 timestamp
    );

    event InvoiceCancelled(uint256 indexed id, address indexed creator);
    event InvoiceMarkedOverdue(uint256 indexed id);
    event FeeUpdated(uint256 oldBps, uint256 newBps);

    // ─────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier invoiceExists(uint256 id) {
        require(id > 0 && id < _nextId, "Invoice not found");
        _;
    }

    modifier onlyCreator(uint256 id) {
        require(invoices[id].creator == msg.sender, "Not invoice creator");
        _;
    }

    // ─────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  CORE FUNCTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new invoice
     * @param payer       Wallet address of the client who will pay
     * @param amountWei   Invoice amount in OPN wei
     * @param dueDays     Number of days until invoice is due
     * @param description Short description of the work
     * @param clientName  Human-readable client name
     * @return id         The new invoice ID
     */
    function createInvoice(
        address payer,
        uint256 amountWei,
        uint256 dueDays,
        string calldata description,
        string calldata clientName
    ) external returns (uint256 id) {
        require(payer != address(0),     "Invalid payer address");
        require(payer != msg.sender,     "Cannot invoice yourself");
        require(amountWei > 0,           "Amount must be > 0");
        require(dueDays > 0,             "Due date must be in future");
        require(bytes(description).length <= 200, "Description too long");
        require(bytes(clientName).length <= 100,  "Client name too long");

        id = _nextId++;
        uint256 dueDate = block.timestamp + (dueDays * 1 days);

        invoices[id] = Invoice({
            id:          id,
            creator:     payable(msg.sender),
            payer:       payer,
            amountWei:   amountWei,
            createdAt:   block.timestamp,
            dueDate:     dueDate,
            status:      Status.Sent,
            description: description,
            clientName:  clientName
        });

        _creatorInvoices[msg.sender].push(id);
        _payerInvoices[payer].push(id);

        emit InvoiceCreated(id, msg.sender, payer, amountWei, dueDate);
    }

    /**
     * @notice Pay an invoice. Caller must send exact invoice amount in OPN.
     *         Platform fee is deducted; remainder goes to creator instantly.
     * @param id  Invoice ID to pay
     */
    function payInvoice(uint256 id)
        external
        payable
        invoiceExists(id)
    {
        Invoice storage inv = invoices[id];

        require(inv.status == Status.Sent,     "Invoice not payable");
        require(msg.sender == inv.payer,       "Only assigned payer can pay");
        require(msg.value == inv.amountWei,    "Send exact invoice amount");

        // Calculate fee and net amount
        uint256 fee    = (inv.amountWei * platformFeeBps) / 10_000;
        uint256 payout = inv.amountWei - fee;

        // Update state before transfer (checks-effects-interactions)
        inv.status = Status.Paid;
        totalPlatformFees += fee;

        // Transfer net amount to creator immediately
        (bool sent, ) = inv.creator.call{value: payout}("");
        require(sent, "Transfer to creator failed");

        emit InvoicePaid(id, msg.sender, inv.amountWei, fee, block.timestamp);
    }

    /**
     * @notice Cancel an unpaid invoice (creator only)
     * @param id  Invoice ID to cancel
     */
    function cancelInvoice(uint256 id)
        external
        invoiceExists(id)
        onlyCreator(id)
    {
        Invoice storage inv = invoices[id];
        require(
            inv.status == Status.Sent || inv.status == Status.Draft,
            "Cannot cancel a paid invoice"
        );
        inv.status = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    /**
     * @notice Mark an invoice as overdue if past due date (anyone can call)
     * @param id  Invoice ID to check
     */
    function markOverdue(uint256 id)
        external
        invoiceExists(id)
    {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Sent,         "Invoice not in Sent state");
        require(block.timestamp > inv.dueDate,     "Not yet overdue");
        inv.status = Status.Overdue;
        emit InvoiceMarkedOverdue(id);
    }

    // ─────────────────────────────────────────────
    //  READ FUNCTIONS
    // ─────────────────────────────────────────────

    /// @notice Get all invoice IDs created by an address
    function getCreatorInvoices(address creator)
        external view returns (uint256[] memory)
    {
        return _creatorInvoices[creator];
    }

    /// @notice Get all invoice IDs assigned to a payer
    function getPayerInvoices(address payer)
        external view returns (uint256[] memory)
    {
        return _payerInvoices[payer];
    }

    /// @notice Get full invoice details
    function getInvoice(uint256 id)
        external view invoiceExists(id)
        returns (Invoice memory)
    {
        return invoices[id];
    }

    /// @notice Calculate how much a payer needs to send for an invoice
    function getPaymentAmount(uint256 id)
        external view invoiceExists(id)
        returns (uint256 total, uint256 fee, uint256 creatorReceives)
    {
        total           = invoices[id].amountWei;
        fee             = (total * platformFeeBps) / 10_000;
        creatorReceives = total - fee;
    }

    /// @notice Total number of invoices ever created
    function totalInvoices() external view returns (uint256) {
        return _nextId - 1;
    }

    // ─────────────────────────────────────────────
    //  ADMIN FUNCTIONS
    // ─────────────────────────────────────────────

    /// @notice Update platform fee (owner only, max 5%)
    function setFee(uint256 newBps) external onlyOwner {
        require(newBps <= 500, "Fee cannot exceed 5%");
        emit FeeUpdated(platformFeeBps, newBps);
        platformFeeBps = newBps;
    }

    /// @notice Withdraw accumulated platform fees (owner only)
    function withdrawFees() external onlyOwner {
        uint256 amount = totalPlatformFees;
        require(amount > 0, "No fees to withdraw");
        totalPlatformFees = 0;
        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdrawal failed");
    }

    /// @notice Transfer contract ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // Reject accidental ETH sends
    receive() external payable {
        revert("Use payInvoice()");
    }
}
