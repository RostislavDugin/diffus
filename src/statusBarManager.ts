import * as vscode from 'vscode';
import { TrackingState } from './types';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private fileCounterItem: vscode.StatusBarItem;
  private clearStateItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      'diffus.tracking',
      vscode.StatusBarAlignment.Right,
      -100,
    );
    this.statusBarItem.name = 'Diffus Tracking';
    this.statusBarItem.command = 'diffus.toggleTracking';
    this.statusBarItem.text = '$(play) Start Tracking';
    this.statusBarItem.tooltip = 'Diffus: Start tracking file changes';
    this.statusBarItem.show();

    this.fileCounterItem = vscode.window.createStatusBarItem(
      'diffus.fileCounter',
      vscode.StatusBarAlignment.Right,
      -101,
    );
    this.fileCounterItem.name = 'Diffus File Counter';
    this.fileCounterItem.command = 'diffus.showChangedFiles';

    this.clearStateItem = vscode.window.createStatusBarItem(
      'diffus.clearState',
      vscode.StatusBarAlignment.Right,
      -102,
    );
    this.clearStateItem.name = 'Diffus Clear State';
    this.clearStateItem.text = '$(trash)';
    this.clearStateItem.tooltip = 'Diffus: Clear all tracking state';
    this.clearStateItem.command = 'diffus.clearState';
  }

  update(state: TrackingState, changedFileCount: number): void {
    switch (state) {
      case TrackingState.Idle:
        this.statusBarItem.text = '$(play) Start Tracking';
        this.statusBarItem.tooltip = 'Diffus: Start tracking file changes';
        this.fileCounterItem.hide();
        this.clearStateItem.hide();
        break;

      case TrackingState.Tracking:
        this.statusBarItem.text = '$(debug-stop) Stop Tracking';
        this.statusBarItem.tooltip = 'Diffus: Stop tracking file changes';
        if (changedFileCount > 0) {
          this.fileCounterItem.text = `$(diff) ${changedFileCount} file${changedFileCount !== 1 ? 's' : ''}`;
          this.fileCounterItem.tooltip = `${changedFileCount} changed file${changedFileCount !== 1 ? 's' : ''} (click to see list)`;
          this.fileCounterItem.show();
        } else {
          this.fileCounterItem.hide();
        }
        this.clearStateItem.show();
        break;

      case TrackingState.StoppedWithPending:
        this.statusBarItem.text = '$(play) Start Tracking';
        this.statusBarItem.tooltip = 'Diffus: Start tracking (pending diffs remain)';
        if (changedFileCount > 0) {
          this.fileCounterItem.text = `$(diff) ${changedFileCount} pending`;
          this.fileCounterItem.tooltip = `${changedFileCount} file${changedFileCount !== 1 ? 's' : ''} with pending diffs (click to see list)`;
          this.fileCounterItem.show();
        } else {
          this.fileCounterItem.hide();
        }
        this.clearStateItem.show();
        break;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
    this.fileCounterItem.dispose();
    this.clearStateItem.dispose();
  }
}
