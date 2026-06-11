export type CollectionDocumentCodec<T = unknown> = {
  readonly decode: (document: import("../store/Document.ts").Document) => T;
  readonly encode: (value: T) => string | Uint8Array;
};

export type CollectionOptions<T = unknown> = {
  readonly codec?: CollectionDocumentCodec<T>;
  readonly extension?: string;
};
