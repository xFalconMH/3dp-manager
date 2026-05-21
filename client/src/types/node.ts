export type NodeAuthType = 'password' | 'token';
export type NodeProtocol = 'http' | 'https';

export interface NodeRecord {
  id: string;
  name: string;
  url: string;
  host?: string;
  domain?: string;
  ip?: string;
  flag?: string;
  port?: number;
  protocol?: NodeProtocol;
  authType: NodeAuthType;
  login?: string;
  isMain: boolean;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NodePayload {
  name: string;
  url: string;
  domain?: string;
  ip?: string;
  flag?: string;
  authType: NodeAuthType;
  login?: string;
  password?: string;
  token?: string;
  isMain?: boolean;
  version?: string;
}
