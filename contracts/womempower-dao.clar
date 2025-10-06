(define-constant ERR-UNAUTHORIZED (err u1000))
(define-constant ERR-NOT-OPEN (err u1001))
(define-constant ERR-INSUFFICIENT-VOTE (err u1002))
(define-constant ERR-INVALID-TITLE (err u1003))
(define-constant ERR-INVALID-DESCRIPTION (err u1004))
(define-constant ERR-INVALID-LOAN-ID (err u1005))
(define-constant ERR-PROPOSAL-EXISTS (err u1006))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u1007))
(define-constant ERR-ALREADY-VOTED (err u1008))
(define-constant ERR-PROPOSAL-EXPIRED (err u1009))
(define-constant ERR-INSUFFICIENT-QUORUM (err u1010))
(define-constant ERR-ALREADY-EXECUTED (err u1011))
(define-constant ERR-INVALID-QUORUM (err u1012))
(define-constant ERR-INVALID-DURATION (err u1013))
(define-constant ERR-INVALID-TOKEN-CONTRACT (err u1014))
(define-constant ERR-INVALID-VOTE-AMOUNT (err u1015))
(define-constant ERR-INSUFFICIENT-BALANCE (err u1016))
(define-constant ERR-INVALID-START-HEIGHT (err u1017))
(define-constant ERR-INVALID-END-HEIGHT (err u1018))
(define-constant ERR-INVALID-EXECUTOR (err u1019))
(define-constant ERR-EXECUTION-FAILED (err u1020))

(define-data-var proposal-count uint u0)
(define-data-var quorum-percent uint u50)
(define-data-var proposal-duration uint u144)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var total-supply uint u1000000)

(define-map proposals
  uint
  {
    title: (string-ascii 128),
    description: (string-ascii 512),
    loan-id: (optional uint),
    proposer: principal,
    start-height: uint,
    end-height: uint,
    yes-votes: uint,
    no-votes: uint,
    executed: bool,
    executor: (optional principal)
  }
)

(define-map votes
  { proposal-id: uint, voter: principal }
  { voted-yes: bool, amount: uint }
)

(define-map proposal-index-by-title (string-ascii 128) uint)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)

(define-read-only (get-vote (proposal-id uint) (voter principal))
  (map-get? votes { proposal-id: proposal-id, voter: voter })
)

(define-read-only (get-quorum-percent)
  (var-get quorum-percent)
)

(define-read-only (get-proposal-duration)
  (var-get proposal-duration)
)

(define-read-only (get-token-contract)
  (var-get token-contract)
)

(define-read-only (get-total-supply)
  (var-get total-supply)
)

(define-read-only (get-proposal-count)
  (var-get proposal-count)
)

(define-read-only (has-voted (proposal-id uint) (voter principal))
  (is-some (get-vote proposal-id voter))
)

(define-read-only (get-total-votes (id uint))
  (let ((prop (unwrap! (get-proposal id) u0)))
    (+ (get yes-votes prop) (get no-votes prop))
  )
)

(define-private (validate-title (title (string-ascii 128)))
  (if (and (> (len title) u0) (<= (len title) u128))
    (ok true)
    ERR-INVALID-TITLE
  )
)

(define-private (validate-description (desc (string-ascii 512)))
  (if (and (> (len desc) u0) (<= (len desc) u512))
    (ok true)
    ERR-INVALID-DESCRIPTION
  )
)

(define-private (validate-loan-id (loan-id (optional uint)))
  (match loan-id
    id (if (> id u0) (ok true) ERR-INVALID-LOAN-ID)
    (ok true)
  )
)

(define-private (validate-quorum (percent uint))
  (if (and (> percent u0) (<= percent u100))
    (ok true)
    ERR-INVALID-QUORUM
  )
)

(define-private (validate-duration (dur uint))
  (if (> dur u0)
    (ok true)
    ERR-INVALID-DURATION
  )
)

(define-private (validate-token-contract (contract principal))
  (if (not (is-eq contract tx-sender))
    (ok true)
    ERR-INVALID-TOKEN-CONTRACT
  )
)

(define-private (validate-vote-amount (amount uint))
  (if (> amount u0)
    (ok true)
    ERR-INVALID-VOTE-AMOUNT
  )
)

(define-private (validate-start-height (height uint))
  (if (>= height block-height)
    (ok true)
    ERR-INVALID-START-HEIGHT
  )
)

(define-private (validate-end-height (start uint) (end uint))
  (if (> end start)
    (ok true)
    ERR-INVALID-END-HEIGHT
  )
)

(define-private (validate-executor (exec (optional principal)))
  (match exec
    p (if (not (is-eq p tx-sender)) (ok true) ERR-INVALID-EXECUTOR)
    (ok true)
  )
)

(define-public (set-quorum-percent (new-percent uint))
  (begin
    (asserts! (is-eq tx-sender (var-get token-contract)) ERR-UNAUTHORIZED)
    (try! (validate-quorum new-percent))
    (var-set quorum-percent new-percent)
    (ok true)
  )
)

(define-public (set-proposal-duration (new-dur uint))
  (begin
    (asserts! (is-eq tx-sender (var-get token-contract)) ERR-UNAUTHORIZED)
    (try! (validate-duration new-dur))
    (var-set proposal-duration new-dur)
    (ok true)
  )
)

(define-public (set-token-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-contract)) ERR-UNAUTHORIZED)
    (try! (validate-token-contract new-contract))
    (var-set token-contract new-contract)
    (ok true)
  )
)

(define-public (set-total-supply (new-supply uint))
  (begin
    (asserts! (is-eq tx-sender (var-get token-contract)) ERR-UNAUTHORIZED)
    (asserts! (> new-supply u0) ERR-INVALID-VOTE-AMOUNT)
    (var-set total-supply new-supply)
    (ok true)
  )
)

(define-public (propose-loan
  (title (string-ascii 128))
  (description (string-ascii 512))
  (loan-id (optional uint))
  (executor (optional principal))
)
  (let
    (
      (new-id (+ (var-get proposal-count) u1))
      (start block-height)
      (end (+ block-height (var-get proposal-duration)))
    )
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-loan-id loan-id))
    (try! (validate-start-height start))
    (try! (validate-end-height start end))
    (try! (validate-executor executor))
    (asserts! (is-none (map-get? proposal-index-by-title title)) ERR-PROPOSAL-EXISTS)
    (map-set proposals new-id
      {
        title: title,
        description: description,
        loan-id: loan-id,
        proposer: tx-sender,
        start-height: start,
        end-height: end,
        yes-votes: u0,
        no-votes: u0,
        executed: false,
        executor: executor
      }
    )
    (map-set proposal-index-by-title title new-id)
    (var-set proposal-count new-id)
    (print { event: "proposal-created", id: new-id, title: title })
    (ok new-id)
  )
)

(define-public (vote (proposal-id uint) (vote-yes bool) (amount uint))
  (let
    (
      (prop (unwrap! (map-get? proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
      (voter tx-sender)
      (balance (unwrap! (contract-call? .wemp-token get-balance voter) ERR-INSUFFICIENT-BALANCE))
    )
    (asserts! (<= block-height (get end-height prop)) ERR-PROPOSAL-EXPIRED)
    (asserts! (not (has-voted proposal-id voter)) ERR-ALREADY-VOTED)
    (try! (validate-vote-amount amount))
    (asserts! (<= amount balance) ERR-INSUFFICIENT-BALANCE)
    (map-set votes { proposal-id: proposal-id, voter: voter } { voted-yes: vote-yes, amount: amount })
    (if vote-yes
      (map-set proposals proposal-id (merge prop { yes-votes: (+ (get yes-votes prop) amount) }))
      (map-set proposals proposal-id (merge prop { no-votes: (+ (get no-votes prop) amount) }))
    )
    (print { event: "vote-cast", proposal-id: proposal-id, voter: voter, yes: vote-yes, amount: amount })
    (ok true)
  )
)

(define-public (execute-proposal (proposal-id uint))
  (let
    (
      (prop (unwrap! (map-get? proposals proposal-id) ERR-PROPOSAL-NOT-FOUND))
      (total-votes (get-total-votes proposal-id))
      (quorum-required (/ (* (var-get total-supply) (var-get quorum-percent)) u100))
    )
    (asserts! (> block-height (get end-height prop)) ERR-NOT-OPEN)
    (asserts! (not (get executed prop)) ERR-ALREADY-EXECUTED)
    (asserts! (>= total-votes quorum-required) ERR-INSUFFICIENT-QUORUM)
    (asserts! (> (get yes-votes prop) (get no-votes prop)) ERR-INSUFFICIENT-VOTE)
    (match (get loan-id prop)
      loan-id
        (try! (contract-call? .loan-issuance issue-loan loan-id u5 u30))
      (ok false)
    )
    (map-set proposals proposal-id (merge prop { executed: true }))
    (print { event: "proposal-executed", id: proposal-id })
    (ok true)
  )
)