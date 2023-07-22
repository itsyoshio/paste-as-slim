import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

async function isERBContent(clipboardText: string): Promise<boolean> {
  return /<%[\s\S]*?%>/.test(clipboardText);
}

async function isHTMLContent(clipboardText: string): Promise<boolean> {
  return /<[a-z][\s\S]*>/i.test(clipboardText);
}

function runCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.exec(command, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function erbToSlim(input: string, type: string): Promise<string> {
  const tempDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.tmpdir();
  const tempFile = path.join(tempDir, 'clipboard_content.erb');
  const outputFile = path.join(tempDir, 'clipboard_content.slim');

  await fs.promises.writeFile(tempFile, input);
  await runCommand(`${type}2slim ${tempFile} ${outputFile}`);
  const data = await fs.promises.readFile(outputFile, 'utf8');
  await fs.promises.unlink(tempFile);
  await fs.promises.unlink(outputFile);
	vscode.env.clipboard.writeText(data).then(() => {
		return data
	}, (clipboardError) => {
		console.log(clipboardError);
	});
  return data;
}

async function pasteAsSlim() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('No active text editor.');
    return;
  }

  const languageId = editor.document.languageId;

  if (languageId !== 'slim') {
    vscode.window.showInformationMessage('The current file is not in slim-lang format.');
    return;
  }

  const clipboardContent = await vscode.env.clipboard.readText();
  const isERB = await isERBContent(clipboardContent);
  const isHTML = await isHTMLContent(clipboardContent);
  const type = isERB ? 'erb' : isHTML ? 'html' : '';

  if (isERB || isHTML) {
    try {
      const convertedContent = await erbToSlim(clipboardContent, type);
      const currentContent = editor.document.getText();
      const pasteStartPosition = currentContent.indexOf(clipboardContent);

      if (pasteStartPosition === -1) {
        vscode.window.showErrorMessage('Failed to find the originally pasted content.');
        return;
      }

      const pasteEndPosition = pasteStartPosition + clipboardContent.length;
      const pasteRange = new vscode.Range(
        editor.document.positionAt(pasteStartPosition),
        editor.document.positionAt(pasteEndPosition)
      );

      editor.edit((editBuilder) => {
        editBuilder.replace(pasteRange, convertedContent);
      });
    } catch (error) {
      console.log(error);
    }
  }
}

async function handleTextDocumentChange(event: vscode.TextDocumentChangeEvent) {
  const { document, contentChanges } = event;
  const languageId = document.languageId;

  if (languageId === 'slim') {
    const clipboardContent = await vscode.env.clipboard.readText();

    for (const change of contentChanges) {
      const changeText = change.text.trim();
      const clipboardText = clipboardContent.trim();

      if (changeText === clipboardText && changeText.length > 1) {
        await pasteAsSlim();
        break;
      }
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "paste-as-slim" is now active!');
  vscode.workspace.onDidChangeTextDocument(handleTextDocumentChange);
}
