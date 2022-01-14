import { CodeQLCliServer } from './cli';
import {
  getOnDiskWorkspaceFolders,
  showAndLogErrorMessage,
  showAndLogInformationMessage,
  showAndLogWarningMessage,
} from './helpers';
import { QuickPickItem, window } from 'vscode';
import { ProgressCallback, UserCancellationException } from './commandRunner';
import { logger } from './logging';

const QUERY_PACKS = [
  'codeql/cpp-queries',
  'codeql/csharp-queries',
  'codeql/go-queries',
  'codeql/java-queries',
  'codeql/javascript-queries',
  'codeql/python-queries',
  'codeql/ruby-queries',
  'codeql/csharp-solorigate-queries',
  'codeql/javascript-experimental-atm-queries',
];

/**
 * Prompts user to choose packs to download, and downloads them.
 *
 * @param cliServer The CLI server.
 * @param progress A progress callback.
 */
export async function handleDownloadPacks(
  cliServer: CodeQLCliServer,
  progress: ProgressCallback,
): Promise<void> {
  progress({
    message: 'Choose packs to download',
    step: 1,
    maxStep: 2,
  });
  let packsToDownload: string[] = [];
  const queryPackOption = 'Download core query packs';
  const customPackOption = 'Download custom specified pack';
  const quickpick = await window.showQuickPick(
    [queryPackOption, customPackOption],
    { ignoreFocusOut: true }
  );
  if (quickpick === queryPackOption) {
    packsToDownload = QUERY_PACKS;
  } else if (quickpick === customPackOption) {
    const customPack = await window.showInputBox({
      prompt:
        'Enter the <package-scope/name[@version]> of the pack to download',
      ignoreFocusOut: true,
    });
    if (customPack) {
      packsToDownload.push(customPack);
    } else {
      throw new UserCancellationException('No pack specified.');
    }
  }
  if (packsToDownload && packsToDownload.length > 0) {
    progress({
      message: 'Downloading packs. This may take a few minutes.',
      step: 2,
      maxStep: 2,
    });
    try {
      await cliServer.packDownload(packsToDownload);
      void showAndLogInformationMessage('Finished downloading packs.');
    } catch (error) {
      void showAndLogErrorMessage(
        'Unable to download all packs. See logs for more details.'
      );
    }
  }
}

interface QLPackQuickPickItem extends QuickPickItem {
  packRootDir: string[];
}

/**
 * Prompts user to choose packs to install, and installs them.
 *
 * @param cliServer The CLI server.
 * @param progress A progress callback.
 */
export async function handleInstallPacks(
  cliServer: CodeQLCliServer,
  progress: ProgressCallback,
): Promise<void> {
  progress({
    message: 'Choose packs to install',
    step: 1,
    maxStep: 2,
  });
  const workspacePacks = await cliServer.resolveQlpacks(getOnDiskWorkspaceFolders());
  const quickPickItems = Object.entries(workspacePacks).map<QLPackQuickPickItem>(([key, value]) => ({
    label: key,
    packRootDir: value,
  }));
  const packsToInstall = await window.showQuickPick(quickPickItems, {
    placeHolder: 'Select packs to install',
    canPickMany: true,
    ignoreFocusOut: true,
  });
  if (packsToInstall && packsToInstall.length > 0) {
    progress({
      message: 'Installing packs. This may take a few minutes.',
      step: 2,
      maxStep: 2,
    });
    const failedPacks = [];
    const errors = [];
    for (const pack of packsToInstall) {
      try {
        for (const dir of pack.packRootDir) {
          await cliServer.packInstall(dir);
        }
      } catch (error) {
        failedPacks.push(pack.label);
        errors.push(error);
      }
    }
    if (failedPacks.length > 0) {
      void logger.log(`Errors:\n${errors.join('\n')}`);
      void showAndLogWarningMessage(
        `Unable to install some packs: ${failedPacks.join(', ')}. See logs for more details.`
      );
    } else {
      void showAndLogInformationMessage('Finished installing packs.');
    }
  } else {
    throw new UserCancellationException('No packs selected.');
  }
}