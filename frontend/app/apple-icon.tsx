import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon: the OmniReflex mark on the dark brand surface. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#151515',
      }}
    >
      <svg width="116" height="116" viewBox="0 0 28 28">
        <path d="m5 6 9 5 9-5v7l-9 5-9-5V6Zm0 9 9 5 9-5v7l-9 5-9-5v-7Z" fill="#f5f5f5" />
      </svg>
    </div>,
    size,
  );
}
