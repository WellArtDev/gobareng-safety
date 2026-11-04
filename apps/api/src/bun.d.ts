// Minimal Bun global used by F2 (password hashing only). Full Bun types
// are intentionally not a dependency of this skeleton.
declare namespace Bun {
  const password: {
    hash(password: string): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
}
