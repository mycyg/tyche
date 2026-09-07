export interface SyncVoiceRecord {
  file: string;
  textSha256: string;
  speaker: string;
  sha256?: string;
}

export function remoteVoicePaths(root = 'E:/TycheAudio') {
  if (!/^(?:[A-Za-z]:\/|\/)[A-Za-z0-9_./-]+$/.test(root) || root.split('/').includes('..')) {
    throw new Error('Pass an absolute remote workspace without spaces or parent traversal.');
  }
  return {output: `${root}/output`, archive: `${root}/transfer.tar`, tar: root.startsWith('/') ? 'tar' : 'tar.exe'};
}

export function needsVoiceTransfer(
  expected: {textSha256: string; speaker: string},
  remote: SyncVoiceRecord | undefined,
  local: SyncVoiceRecord | undefined,
  localFileExists: boolean,
): boolean {
  if (!remote || remote.textSha256 !== expected.textSha256 || remote.speaker !== expected.speaker) return false;
  return !local || !localFileExists || local.textSha256 !== remote.textSha256
    || local.speaker !== remote.speaker || local.file !== remote.file || local.sha256 !== remote.sha256;
}
