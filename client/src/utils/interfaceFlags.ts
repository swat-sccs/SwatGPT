import type { TInterfaceConfig } from 'librechat-data-provider';

type UseFlag = boolean | { use?: boolean } | undefined;

export function isInterfaceUseEnabled(value: UseFlag, fallback = true): boolean {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === 'boolean' ? value : value.use !== false;
}

export function areProjectsEnabled(interfaceConfig?: Partial<TInterfaceConfig>): boolean {
  return interfaceConfig?.projects === true;
}

export function isFilesPanelEnabled(interfaceConfig?: Partial<TInterfaceConfig>): boolean {
  return interfaceConfig?.fileSearch !== false;
}

export function shouldHideModelSelector(
  modelSelect: boolean | undefined,
  specCount: number,
): boolean {
  return modelSelect === false && specCount <= 1;
}
