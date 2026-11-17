import {
  MAX_SHARE_IMAGE_SIDE,
  buildShareUrl,
  isSharePath,
  parseShareId,
  shareImageScale,
} from '@/modules/share/domain/shareLink';

const ID = '5aaaaaaa-0000-4000-8000-000000000001';

describe('share links', () => {
  it('builds and parses share URLs', () => {
    const url = buildShareUrl('https://app.test', ID);

    expect(url).toBe(`https://app.test/s/${ID}`);
    expect(parseShareId(new URL(url).pathname)).toBe(ID);
    expect(parseShareId(`/s/${ID.toUpperCase()}/`)).toBe(ID);
  });

  it('rejects anything that is not a share id', () => {
    expect(parseShareId('/')).toBeNull();
    expect(parseShareId('/s/')).toBeNull();
    expect(parseShareId('/s/not-a-uuid')).toBeNull();
    expect(parseShareId(`/s/${ID}/extra`)).toBeNull();
    expect(parseShareId(`/s/${ID}?x=1`)).toBeNull();
  });

  it('recognises share pages even with a bad id', () => {
    expect(isSharePath('/s/garbage')).toBe(true);
    expect(isSharePath('/settings')).toBe(false);
  });

  it('caps the share image size without upscaling small designs', () => {
    expect(shareImageScale(1080, 1350)).toBe(1);
    expect(shareImageScale(4800, 2400)).toBe(MAX_SHARE_IMAGE_SIDE / 4800);
    expect(shareImageScale(2400, 7200)).toBe(MAX_SHARE_IMAGE_SIDE / 7200);
  });
});
