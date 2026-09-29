import fs from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * 저장소 어댑터 인터페이스. 로컬 디스크 구현이 기본이며, S3 등으로 교체하려면
 * 이 인터페이스를 구현한 새 어댑터를 만들고 아래 export만 바꾸면 된다.
 */
export interface StorageAdapter {
  save(buffer: Buffer, filename: string): Promise<{ storagePath: string }>;
  absolutePath(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}

class LocalDiskStorage implements StorageAdapter {
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  async save(buffer: Buffer, filename: string): Promise<{ storagePath: string }> {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename.replace(/[^\w.\-]/g, "_")}`;
    const full = path.join(this.root, safe);
    await fs.promises.writeFile(full, buffer);
    return { storagePath: safe };
  }

  absolutePath(storagePath: string): string {
    return path.join(this.root, storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    const full = this.absolutePath(storagePath);
    await fs.promises.rm(full, { force: true });
  }
}

export const storage: StorageAdapter = new LocalDiskStorage(env.uploadDir);
