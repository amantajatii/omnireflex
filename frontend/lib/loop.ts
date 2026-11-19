import type { ChainId } from './chains';
export const firstLoop: {
  title: string;
  chainId: ChainId;
  block: bigint | null;
  hash: `0x${string}`;
}[] = [
  {
    title: 'Order created',
    chainId: 1301,
    block: null,
    hash: '0x34f4a9e980aac1d156ae55ecdab95f88bb15621a69e268494e3097bd6c211716',
  },
  {
    title: 'Swap moves price · T0',
    chainId: 1301,
    block: 68167336n,
    hash: '0x2498203aa968996b62effcfeeb222ef959f15ff7fff068eb3e91c995734dec04',
  },
  {
    title: 'Reactive contract fires · T1',
    chainId: 5318007,
    block: 8665844n,
    hash: '0xd22fcf64678443be1f49bfd088d906a3a691fe61d078b69812c4e085a9d3a9e6',
  },
  {
    title: 'Order executed · T2',
    chainId: 1301,
    block: 68167338n,
    hash: '0xa0bf538c3695fd1bc1ac369f522490b6d83ca5cefe21af3f661f7c232d0c2710',
  },
];
export const mirrorClosed = {
  chainId: 5318007 as const,
  block: 8665846n,
  hash: '0xedb5e9f37def80d51fc0cd89a72ddbdda4fbf918d36f585c4533db0d4737ba80',
};
