// Selected from the compiled Reflex interfaces; ExecutionTrace.originTxHash is uint256.
export const executorAbi = [
  {
    type: 'function',
    name: 'availableForCallbacks',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'executionFee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOrder',
    inputs: [{ name: 'orderId', type: 'uint64', internalType: 'uint64' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct Order',
        components: [
          { name: 'owner', type: 'address', internalType: 'address' },
          { name: 'status', type: 'uint8', internalType: 'enum OrderStatus' },
          {
            name: 'params',
            type: 'tuple',
            internalType: 'struct OrderParams',
            components: [
              {
                name: 'poolKey',
                type: 'tuple',
                internalType: 'struct PoolKey',
                components: [
                  { name: 'currency0', type: 'address', internalType: 'Currency' },
                  { name: 'currency1', type: 'address', internalType: 'Currency' },
                  { name: 'fee', type: 'uint24', internalType: 'uint24' },
                  { name: 'tickSpacing', type: 'int24', internalType: 'int24' },
                  { name: 'hooks', type: 'address', internalType: 'contract IHooks' },
                ],
              },
              { name: 'zeroForOne', type: 'bool', internalType: 'bool' },
              { name: 'amountIn', type: 'uint128', internalType: 'uint128' },
              { name: 'minAmountOut', type: 'uint128', internalType: 'uint128' },
              { name: 'expiry', type: 'uint64', internalType: 'uint64' },
              {
                name: 'trigger',
                type: 'tuple',
                internalType: 'struct TriggerParams',
                components: [
                  { name: 'chainId', type: 'uint256', internalType: 'uint256' },
                  { name: 'poolId', type: 'bytes32', internalType: 'bytes32' },
                  { name: 'inverted', type: 'bool', internalType: 'bool' },
                  { name: 'lowerTick', type: 'int24', internalType: 'int24' },
                  { name: 'upperTick', type: 'int24', internalType: 'int24' },
                  { name: 'trailTicks', type: 'uint24', internalType: 'uint24' },
                ],
              },
            ],
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reservedFees',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderCreated',
    inputs: [
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      {
        name: 'trigger',
        type: 'tuple',
        indexed: false,
        internalType: 'struct TriggerParams',
        components: [
          { name: 'chainId', type: 'uint256', internalType: 'uint256' },
          { name: 'poolId', type: 'bytes32', internalType: 'bytes32' },
          { name: 'inverted', type: 'bool', internalType: 'bool' },
          { name: 'lowerTick', type: 'int24', internalType: 'int24' },
          { name: 'upperTick', type: 'int24', internalType: 'int24' },
          { name: 'trailTicks', type: 'uint24', internalType: 'uint24' },
        ],
      },
      { name: 'expiry', type: 'uint64', indexed: false, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderExecuted',
    inputs: [
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amountIn', type: 'uint128', indexed: false, internalType: 'uint128' },
      { name: 'amountOut', type: 'uint128', indexed: false, internalType: 'uint128' },
      {
        name: 'trace',
        type: 'tuple',
        indexed: false,
        internalType: 'struct ExecutionTrace',
        components: [
          { name: 'originChainId', type: 'uint256', internalType: 'uint256' },
          { name: 'originBlockNumber', type: 'uint256', internalType: 'uint256' },
          { name: 'originTxHash', type: 'uint256', internalType: 'uint256' },
          { name: 'originLogIndex', type: 'uint256', internalType: 'uint256' },
          { name: 'tick', type: 'int24', internalType: 'int24' },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderExecutionFailed',
    inputs: [
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'reason', type: 'bytes', indexed: false, internalType: 'bytes' },
      {
        name: 'trace',
        type: 'tuple',
        indexed: false,
        internalType: 'struct ExecutionTrace',
        components: [
          { name: 'originChainId', type: 'uint256', internalType: 'uint256' },
          { name: 'originBlockNumber', type: 'uint256', internalType: 'uint256' },
          { name: 'originTxHash', type: 'uint256', internalType: 'uint256' },
          { name: 'originLogIndex', type: 'uint256', internalType: 'uint256' },
          { name: 'tick', type: 'int24', internalType: 'int24' },
        ],
      },
    ],
    anonymous: false,
  },
] as const;
export const reactiveAbi = [
  {
    type: 'event',
    name: 'OrderClosed',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderEvicted',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderExhausted',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderMirrored',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'triggerChainId', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'poolId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderRearmed',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      { name: 'retries', type: 'uint8', indexed: false, internalType: 'uint8' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderRejected',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      {
        name: 'reason',
        type: 'uint8',
        indexed: false,
        internalType: 'enum IReflexReactive.RejectReason',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OrderTriggered',
    inputs: [
      { name: 'execChainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'orderId', type: 'uint64', indexed: true, internalType: 'uint64' },
      {
        name: 'trace',
        type: 'tuple',
        indexed: false,
        internalType: 'struct ExecutionTrace',
        components: [
          { name: 'originChainId', type: 'uint256', internalType: 'uint256' },
          { name: 'originBlockNumber', type: 'uint256', internalType: 'uint256' },
          { name: 'originTxHash', type: 'uint256', internalType: 'uint256' },
          { name: 'originLogIndex', type: 'uint256', internalType: 'uint256' },
          { name: 'tick', type: 'int24', internalType: 'int24' },
        ],
      },
    ],
    anonymous: false,
  },
] as const;
export const poolAbi = [
  {
    type: 'function',
    name: 'extsload',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'bytes32' }],
    outputs: [{ name: 'value', type: 'bytes32' }],
  },
] as const;
