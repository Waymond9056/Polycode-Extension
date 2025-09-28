import * as vscode from "vscode";
import { P2PUser } from "./p2pUser";
import { randomBytes } from "crypto";

// Generate a unique client ID for this instance
const CLIENT_ID = randomBytes(8).toString("hex");

// Flag to prevent infinite loops when applying CRDT updates from P2P
let isApplyingCRDTUpdate = false;

export function activate(context: vscode.ExtensionContext) {
  console.log("Polycode extension activated with client ID:", CLIENT_ID);

  // Check for git repository
  checkGitRepository().then((hasGit) => {
    console.log("Git repository check result:", hasGit);
  });

  // Initialize P2P User for real-time collaboration
  // Both users can now send and receive messages bidirectionally
  const p2pUser = new P2PUser("polycode2", CLIENT_ID, applyCRDTUpdatesToFile);
  context.subscriptions.push({
    dispose: async () => {
      await p2pUser.stop();
    },
  });

  // Sidebar provider
  const provider = new PolycodeViewProvider(context, p2pUser);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("polycode.view", provider)
  );

  // Start P2P networking
  p2pUser
    .start()
    .then(() => {
      console.log("P2P network started successfully");
      // Send initial P2P status to webview
      setTimeout(() => {
        provider.sendP2PStatus(p2pUser);
      }, 200);
    })
    .catch(console.error);

  // Listen for text document changes to create CRDT updates for ALL files
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      // Skip if we're currently applying a CRDT update to prevent infinite loops
      if (isApplyingCRDTUpdate) {
        console.log(
          "Skipping document change event - currently applying CRDT update"
        );
        return;
      }

      // Only process events with actual content changes
      if (event.contentChanges.length === 0) {
        console.log("Skipping document change event with no content changes");
        return;
      }

      // Send changes for any file in the workspace to enable synchronous collaboration
      console.log(
        "Text document changed in file:",
        event.document.uri.fsPath,
        "contentChanges:",
        event.contentChanges.length
      );
      console.log("Content changes:", event.contentChanges);

      const crdtUpdate = createCRDTUpdate(event);
      console.log("CRDT Update:", JSON.stringify(crdtUpdate, null, 2));

      // Send CRDT update to webview
      provider.sendCRDTUpdate(crdtUpdate);

      // Broadcast CRDT update to P2P network for synchronous collaboration
      p2pUser.broadcastCRDTUpdate(crdtUpdate).catch(console.error);
    })
  );

  // Command to open a full panel
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.openPanel", () => {
      console.log("Setting up panel webview");
      const panel = vscode.window.createWebviewPanel(
        "polycode.panel",
        "PolyCode Panel",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "media", "dist"),
          ],
        }
      );
      panel.webview.html = getWebviewHtml(panel.webview, context, "panel");
      hookMessages(panel.webview, provider, p2pUser, context);
    })
  );

  // Command to set sidebar size
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.setSidebarSize", async () => {
      const sizeOptions = [
        { label: "Narrow (280px)", value: "narrow" },
        { label: "Default (Auto)", value: "default" },
        { label: "Wide (500px)", value: "wide" },
        { label: "Custom...", value: "custom" },
      ];

      const selected = await vscode.window.showQuickPick(sizeOptions, {
        placeHolder: "Select sidebar size",
        title: "PolyCode Sidebar Size",
      });

      if (selected) {
        if (selected.value === "custom") {
          const customSize = await vscode.window.showInputBox({
            prompt: "Enter custom width in pixels",
            value: "400",
            validateInput: (value) => {
              const num = parseInt(value);
              if (isNaN(num) || num < 200 || num > 1000) {
                return "Please enter a number between 200 and 1000";
              }
              return null;
            },
          });

          if (customSize) {
            provider?.setSidebarSize(parseInt(customSize));
          }
        } else {
          provider?.setSidebarSize(selected.value);
        }
      }
    })
  );

  // Keep helloWorld example
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.helloWorld", () => {
      console.log("Hello World command executed!");
      vscode.window.showInformationMessage("Hello World from PolyCode!");
    })
  );
}

export function deactivate() {}

async function checkGitRepository(): Promise<boolean> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.log("No workspace folder found");
      return false;
    }

    // Check if .git directory exists
    const gitDir = vscode.Uri.joinPath(workspaceFolder.uri, ".git");
    try {
      await vscode.workspace.fs.stat(gitDir);
      console.log("Git repository found");
      return true;
    } catch (error) {
      console.log("No git repository found");
      return false;
    }
  } catch (error) {
    console.error("Error checking git repository:", error);
    return false;
  }
}

async function setupDockerProject(
  languages: string[],
  context: vscode.ExtensionContext,
  rebuild: boolean = false
): Promise<boolean> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.error("No workspace folder found");
      return false;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    console.log("Setting up Docker project in:", workspacePath);
    console.log("Selected languages:", languages);

    // Check if this is the first time setting up Docker
    const srcDir = vscode.Uri.joinPath(workspaceFolder.uri, "src");
    let isFirstTime = true;
    if (!rebuild) {
      try {
        await vscode.workspace.fs.stat(srcDir);
        isFirstTime = false; // src directory exists, not first time
      } catch (error) {
        isFirstTime = true; // src directory doesn't exist, first time
      }
    } else {
      isFirstTime = false; // Rebuild means not first time
    }

    // Create DockerContainer directory
    const dockerContainerDir = vscode.Uri.joinPath(
      workspaceFolder.uri,
      "DockerContainer"
    );
    console.log("DockerContainer directory path:", dockerContainerDir.fsPath);
    try {
      await vscode.workspace.fs.stat(dockerContainerDir);
      console.log("DockerContainer directory already exists");
    } catch (error) {
      await vscode.workspace.fs.createDirectory(dockerContainerDir);
      console.log("Created DockerContainer directory");
    }

    // Create src directory
    try {
      await vscode.workspace.fs.stat(srcDir);
      console.log("src directory already exists");
    } catch (error) {
      await vscode.workspace.fs.createDirectory(srcDir);
      console.log("Created src directory");
    }

    // If this is the first time, move existing files to src/ using git mv
    if (isFirstTime) {
      console.log("First time Docker setup - moving existing files to src/");
      await moveExistingFilesToSrc(workspaceFolder);
    }

    // Generate Docker files based on selected languages
    console.log(
      "About to generate Docker files in:",
      dockerContainerDir.fsPath
    );
    await generateDockerFiles(dockerContainerDir, languages, context);

    // If this is a rebuild, force rebuild the container
    if (rebuild) {
      console.log("Rebuilding Docker container after language changes");
      const repositoryName = workspaceFolder.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const containerName = `${repositoryName}-container`;

      try {
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);

        await execAsync(
          `cd "${dockerContainerDir.fsPath}" && docker build -t "${containerName}" .`
        );
        console.log(`Successfully rebuilt container: ${containerName}`);
      } catch (error) {
        console.error(`Error rebuilding container: ${error}`);
        // Don't fail the setup if rebuild fails, just log it
      }
    }

    console.log("Docker project setup completed successfully");
    return true;
  } catch (error) {
    console.error("Error setting up Docker project:", error);
    return false;
  }
}

async function moveExistingFilesToSrc(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);

  try {
    // Get list of files and directories in the workspace root
    const workspacePath = workspaceFolder.uri.fsPath;
    const entries = await vscode.workspace.fs.readDirectory(
      workspaceFolder.uri
    );

    // Filter out git files and directories we don't want to move
    const filesToMove = entries.filter(([name, type]) => {
      // Don't move git files/directories
      if (name.startsWith(".git")) return false;
      // Don't move the src directory itself
      if (name === "src") return false;
      // Don't move DockerContainer directory
      if (name === "DockerContainer") return false;
      // Don't move hidden files that might be important
      if (name.startsWith(".")) return false;
      return true;
    });

    console.log(
      "Files to move to src/:",
      filesToMove.map(([name]) => name)
    );

    // Move each file/directory using git mv to preserve history
    for (const [name, type] of filesToMove) {
      try {
        const sourcePath = `"${name}"`;
        const destPath = `"src/${name}"`;

        console.log(`Moving ${name} to src/ using git mv`);
        await execAsync(
          `cd "${workspacePath}" && git mv ${sourcePath} ${destPath}`
        );
        console.log(`Successfully moved ${name} to src/`);
      } catch (error) {
        console.error(`Error moving ${name} to src/:`, error);
        // If git mv fails, try regular mv as fallback
        try {
          const { exec } = require("child_process");
          const { promisify } = require("util");
          const execAsync = promisify(exec);
          await execAsync(
            `cd "${workspacePath}" && mv "${name}" "src/${name}"`
          );
          console.log(`Fallback: moved ${name} to src/ using mv`);
        } catch (fallbackError) {
          console.error(
            `Fallback move also failed for ${name}:`,
            fallbackError
          );
        }
      }
    }

    console.log("Finished moving existing files to src/");
  } catch (error) {
    console.error("Error in moveExistingFilesToSrc:", error);
    throw error;
  }
}

async function generateDockerFiles(
  dockerContainerDir: vscode.Uri,
  languages: string[],
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    console.log(
      "generateDockerFiles called with:",
      dockerContainerDir.fsPath,
      languages
    );
    const extensionPath = context.extensionPath;
    console.log("Extension path:", extensionPath);

    const setupFilesDir = vscode.Uri.joinPath(
      vscode.Uri.file(extensionPath),
      "DockerSandbox",
      "setup_files"
    );
    console.log("Setup files directory:", setupFilesDir.fsPath);

    // Generate Dockerfile based on selected languages
    const dockerfileContent = await generateDockerfile(
      setupFilesDir,
      languages
    );
    const dockerfilePath = vscode.Uri.joinPath(
      dockerContainerDir,
      "Dockerfile"
    );
    console.log("Writing Dockerfile to:", dockerfilePath.fsPath);
    await vscode.workspace.fs.writeFile(
      dockerfilePath,
      Buffer.from(dockerfileContent, "utf-8")
    );
    console.log("Generated Dockerfile");

    // Generate entrypoint script based on selected languages
    const entrypointContent = await generateEntrypointScript(
      setupFilesDir,
      languages
    );
    const entrypointPath = vscode.Uri.joinPath(
      dockerContainerDir,
      "entrypoint2.sh"
    );
    console.log("Writing entrypoint script to:", entrypointPath.fsPath);
    await vscode.workspace.fs.writeFile(
      entrypointPath,
      Buffer.from(entrypointContent, "utf-8")
    );
    console.log("Generated entrypoint script");

    // Copy build and run scripts
    const sourceDockerDir = vscode.Uri.joinPath(
      vscode.Uri.file(extensionPath),
      "DockerSandbox",
      "DockerContainer"
    );

    // Copy build script
    try {
      const buildScriptSource = vscode.Uri.joinPath(
        sourceDockerDir,
        "build_docker.sh"
      );
      const buildScriptDest = vscode.Uri.joinPath(
        dockerContainerDir,
        "build_docker.sh"
      );
      console.log(
        "Copying build script from:",
        buildScriptSource.fsPath,
        "to:",
        buildScriptDest.fsPath
      );
      const buildScriptContent = await vscode.workspace.fs.readFile(
        buildScriptSource
      );
      await vscode.workspace.fs.writeFile(buildScriptDest, buildScriptContent);
      console.log("Copied build script");
    } catch (error) {
      console.error("Error copying build script:", error);
    }

    // Copy run script
    try {
      const runScriptSource = vscode.Uri.joinPath(
        sourceDockerDir,
        "run_docker.sh"
      );
      const runScriptDest = vscode.Uri.joinPath(
        dockerContainerDir,
        "run_docker.sh"
      );
      console.log(
        "Copying run script from:",
        runScriptSource.fsPath,
        "to:",
        runScriptDest.fsPath
      );
      const runScriptContent = await vscode.workspace.fs.readFile(
        runScriptSource
      );
      await vscode.workspace.fs.writeFile(runScriptDest, runScriptContent);
      console.log("Copied run script");
    } catch (error) {
      console.error("Error copying run script:", error);
    }
  } catch (error) {
    console.error("Error generating Docker files:", error);
    throw error;
  }
}

async function generateDockerfile(
  setupFilesDir: vscode.Uri,
  languages: string[]
): Promise<string> {
  let dockerContent = "";

  // Read docker_head.txt
  const dockerHeadPath = vscode.Uri.joinPath(setupFilesDir, "docker_head.txt");
  const dockerHeadContent = await vscode.workspace.fs.readFile(dockerHeadPath);
  dockerContent += Buffer.from(dockerHeadContent).toString("utf-8") + "\n";

  // Add language-specific sections
  if (languages.includes("java")) {
    const dockerJavaPath = vscode.Uri.joinPath(
      setupFilesDir,
      "docker_java.txt"
    );
    const dockerJavaContent = await vscode.workspace.fs.readFile(
      dockerJavaPath
    );
    dockerContent += Buffer.from(dockerJavaContent).toString("utf-8") + "\n";
  }

  if (languages.includes("python")) {
    const dockerPythonPath = vscode.Uri.joinPath(
      setupFilesDir,
      "docker_python.txt"
    );
    const dockerPythonContent = await vscode.workspace.fs.readFile(
      dockerPythonPath
    );
    dockerContent += Buffer.from(dockerPythonContent).toString("utf-8") + "\n";
  }

  if (languages.includes("typescript")) {
    const dockerTsPath = vscode.Uri.joinPath(setupFilesDir, "docker_ts.txt");
    const dockerTsContent = await vscode.workspace.fs.readFile(dockerTsPath);
    dockerContent += Buffer.from(dockerTsContent).toString("utf-8") + "\n";
  }

  // Read docker_tail.txt
  const dockerTailPath = vscode.Uri.joinPath(setupFilesDir, "docker_tail.txt");
  const dockerTailContent = await vscode.workspace.fs.readFile(dockerTailPath);
  dockerContent += Buffer.from(dockerTailContent).toString("utf-8") + "\n";

  return dockerContent;
}

async function generateEntrypointScript(
  setupFilesDir: vscode.Uri,
  languages: string[]
): Promise<string> {
  let shContent = "";

  // Read sh_head.txt
  const shHeadPath = vscode.Uri.joinPath(setupFilesDir, "sh_head.txt");
  const shHeadContent = await vscode.workspace.fs.readFile(shHeadPath);
  let headContent = Buffer.from(shHeadContent).toString("utf-8");

  // Update the supported file types list based on selected languages
  const supportedTypes: string[] = [];
  if (languages.includes("python")) supportedTypes.push(".py");
  if (languages.includes("java")) supportedTypes.push(".java");
  if (languages.includes("typescript")) supportedTypes.push(".ts", ".js");

  // Replace the hardcoded file types in the head content
  headContent = headContent.replace(
    /find \/app -type f \\( -name "\\*\\.py" -o -name "\\*\\.java" -o -name "\\*\\.ts" -o -name "\\*\\.js" \\)/,
    `find /app -type f \\( ${supportedTypes
      .map((type) => `-name "*${type}"`)
      .join(" -o ")} \\)`
  );

  shContent += headContent + "\n";

  // Add language-specific sections
  if (languages.includes("java")) {
    const shJavaPath = vscode.Uri.joinPath(setupFilesDir, "sh_java.txt");
    const shJavaContent = await vscode.workspace.fs.readFile(shJavaPath);
    shContent += Buffer.from(shJavaContent).toString("utf-8") + "\n";
  }

  if (languages.includes("python")) {
    const shPythonPath = vscode.Uri.joinPath(setupFilesDir, "sh_python.txt");
    const shPythonContent = await vscode.workspace.fs.readFile(shPythonPath);
    shContent += Buffer.from(shPythonContent).toString("utf-8") + "\n";
  }

  if (languages.includes("typescript")) {
    const shTsPath = vscode.Uri.joinPath(setupFilesDir, "sh_typescript.txt");
    const shTsContent = await vscode.workspace.fs.readFile(shTsPath);
    shContent += Buffer.from(shTsContent).toString("utf-8") + "\n";
  }

  // Read sh_tail.txt and update supported types
  const shTailPath = vscode.Uri.joinPath(setupFilesDir, "sh_tail.txt");
  const shTailContent = await vscode.workspace.fs.readFile(shTailPath);
  let tailContent = Buffer.from(shTailContent).toString("utf-8");

  // Replace the hardcoded supported types in the tail
  tailContent = tailContent.replace(
    /echo "Supported types: \\.py, \\.java, \\.ts, \\.js"/,
    `echo "Supported types: ${supportedTypes.join(", ")}"`
  );

  shContent += tailContent + "\n";

  return shContent;
}

async function getDockerStatus(context: vscode.ExtensionContext): Promise<{
  dockerEnabled: boolean;
  supportedLanguages: string[];
  containerExists: boolean;
}> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return {
        dockerEnabled: false,
        supportedLanguages: [],
        containerExists: false,
      };
    }

    // Check if DockerContainer directory exists
    const dockerContainerDir = vscode.Uri.joinPath(
      workspaceFolder.uri,
      "DockerContainer"
    );
    let dockerEnabled = false;
    let supportedLanguages: string[] = [];

    try {
      await vscode.workspace.fs.stat(dockerContainerDir);
      dockerEnabled = true;
      console.log("Docker is enabled - DockerContainer directory found");

      // Read the generated Dockerfile to detect supported languages
      const dockerfilePath = vscode.Uri.joinPath(
        dockerContainerDir,
        "Dockerfile"
      );
      try {
        const dockerfileContent = await vscode.workspace.fs.readFile(
          dockerfilePath
        );
        const content = Buffer.from(dockerfileContent).toString("utf-8");

        // Detect languages based on Dockerfile content
        if (content.includes("openjdk")) {
          supportedLanguages.push("java");
        }
        if (content.includes("python3")) {
          supportedLanguages.push("python");
        }
        if (content.includes("typescript")) {
          supportedLanguages.push("typescript");
        }

        console.log("Detected supported languages:", supportedLanguages);
      } catch (error) {
        console.error("Error reading Dockerfile:", error);
      }
    } catch (error) {
      dockerEnabled = false;
      console.log(
        "Docker is not enabled - DockerContainer directory not found"
      );
    }

    // Check if container exists
    let containerExists = false;
    if (dockerEnabled) {
      const repositoryName = workspaceFolder.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const containerName = `${repositoryName}-container`;

      try {
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);

        const result = await execAsync(`docker images -q ${containerName}`);
        if (result.stdout.trim()) {
          containerExists = true;
        }
      } catch (error) {
        containerExists = false;
      }
    }

    return {
      dockerEnabled,
      supportedLanguages,
      containerExists,
    };
  } catch (error) {
    console.error("Error getting Docker status:", error);
    return {
      dockerEnabled: false,
      supportedLanguages: [],
      containerExists: false,
    };
  }
}

async function runCurrentFile(
  context: vscode.ExtensionContext,
  forceRebuild: boolean = false
): Promise<boolean> {
  // Create output channel outside try block to avoid scope issues
  const outputChannel = vscode.window.createOutputChannel("Docker Output");

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.error("No workspace folder found");
      return false;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("No active file to run");
      return false;
    }

    const currentFile = activeEditor.document.uri;
    const workspacePath = workspaceFolder.uri.fsPath;

    // Debug: Check if the file is actually in the workspace
    console.log(`Active editor file: ${currentFile.fsPath}`);
    console.log(`Workspace folder: ${workspaceFolder.uri.fsPath}`);
    console.log(
      `Is file in workspace: ${currentFile.fsPath.startsWith(workspacePath)}`
    );

    // Check if Docker is enabled (DockerContainer directory exists)
    const dockerContainerDir = vscode.Uri.joinPath(
      workspaceFolder.uri,
      "DockerContainer"
    );
    let dockerEnabled = false;

    try {
      await vscode.workspace.fs.stat(dockerContainerDir);
      dockerEnabled = true;
      console.log("Docker is enabled - DockerContainer directory found");
    } catch (error) {
      dockerEnabled = false;
      console.log("Docker is not enabled - using VS Code default execution");
    }

    if (!dockerEnabled) {
      // Use VS Code default execution
      console.log("Running file with VS Code default execution");
      const fileExtension = currentFile.path.split(".").pop()?.toLowerCase();

      switch (fileExtension) {
        case "js":
          vscode.commands.executeCommand(
            "workbench.action.terminal.sendSequence",
            {
              text: `node "${currentFile.fsPath}"\n`,
            }
          );
          break;
        case "ts":
          vscode.commands.executeCommand(
            "workbench.action.terminal.sendSequence",
            {
              text: `npx ts-node "${currentFile.fsPath}"\n`,
            }
          );
          break;
        case "py":
          vscode.commands.executeCommand(
            "workbench.action.terminal.sendSequence",
            {
              text: `python "${currentFile.fsPath}"\n`,
            }
          );
          break;
        case "java":
          vscode.commands.executeCommand(
            "workbench.action.terminal.sendSequence",
            {
              text: `javac "${
                currentFile.fsPath
              }" && java "${currentFile.fsPath.replace(".java", "")}"\n`,
            }
          );
          break;
        default:
          vscode.window.showErrorMessage(
            `Unsupported file type: ${fileExtension}`
          );
          return false;
      }
      return true;
    }

    // Docker is enabled - use Docker execution
    console.log("Running file with Docker");

    // Get repository name for container naming
    const repositoryName = workspaceFolder.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const containerName = `${repositoryName}-container`;

    // Check if container exists
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    let containerExists = false;
    try {
      const result = await execAsync(`docker images -q ${containerName}`);
      if (result.stdout.trim()) {
        containerExists = true;
        console.log(`Container ${containerName} already exists`);
      } else {
        containerExists = false;
        console.log(`Container ${containerName} does not exist, will build it`);
      }
    } catch (error) {
      containerExists = false;
      console.log(`Container ${containerName} does not exist, will build it`);
    }

    // Check if container needs rebuilding (doesn't exist or is older than Docker files)
    let needsRebuild = !containerExists || forceRebuild;

    if (containerExists && !forceRebuild) {
      try {
        // Check if Docker files are newer than the container
        const dockerfilePath = vscode.Uri.joinPath(
          dockerContainerDir,
          "Dockerfile"
        );
        const entrypointPath = vscode.Uri.joinPath(
          dockerContainerDir,
          "entrypoint2.sh"
        );

        const dockerfileStat = await vscode.workspace.fs.stat(dockerfilePath);
        const entrypointStat = await vscode.workspace.fs.stat(entrypointPath);

        // Get container creation time
        const containerInspectResult = await execAsync(
          `docker inspect ${containerName} --format='{{.Created}}'`
        );
        const containerCreated = new Date(containerInspectResult.stdout.trim());

        // Check if Docker files are newer than container
        const dockerfileModified = new Date(dockerfileStat.mtime);
        const entrypointModified = new Date(entrypointStat.mtime);

        if (
          dockerfileModified > containerCreated ||
          entrypointModified > containerCreated
        ) {
          needsRebuild = true;
          console.log(`Docker files are newer than container, rebuilding...`);
        }
      } catch (error) {
        console.log(
          `Could not check file timestamps, rebuilding to be safe: ${error}`
        );
        needsRebuild = true;
      }
    }

    if (needsRebuild) {
      console.log(
        `Building Docker container: ${containerName}${
          forceRebuild ? " (forced rebuild)" : ""
        }`
      );
      try {
        console.log(
          `Building Docker container in: ${dockerContainerDir.fsPath}`
        );
        // Build Docker container directly using docker build command
        await execAsync(
          `cd "${dockerContainerDir.fsPath}" && docker build -t "${containerName}" .`
        );
        console.log(`Successfully built container: ${containerName}`);
      } catch (error) {
        console.error(`Error building container: ${error}`);
        vscode.window.showErrorMessage(
          `Failed to build Docker container: ${error}`
        );
        return false;
      }
    } else {
      console.log(`Container ${containerName} is up to date, skipping build`);
    }

    // Run the file with Docker
    console.log(`Running file with Docker container: ${containerName}`);
    try {
      // Get relative path, handling files outside workspace
      let relativeFilePath: string;
      if (currentFile.fsPath.startsWith(workspacePath)) {
        relativeFilePath = vscode.workspace.asRelativePath(currentFile);
      } else {
        // File is outside workspace, use the full path
        relativeFilePath = currentFile.fsPath;
      }
      console.log(`Relative file path: ${relativeFilePath}`);

      // Extract just the filename from the path
      const pathParts = relativeFilePath.split("/");
      const fileName = pathParts[pathParts.length - 1];
      console.log(`File name for container: ${fileName}`);

      // Run Docker container with bind mount to src folder only, then pass just the filename
      const srcPath = vscode.Uri.joinPath(workspaceFolder.uri, "src").fsPath;
      const dockerCommand = `docker run --mount type=bind,source="${srcPath}",target=/app "${containerName}" "${fileName}"`;
      console.log(`Docker command: ${dockerCommand}`);

      const result = await execAsync(dockerCommand);
      console.log(`Docker stdout: ${result.stdout}`);
      if (result.stderr) {
        console.log(`Docker stderr: ${result.stderr}`);
      }

      // Print output to VS Code output channel
      if (result.stdout) {
        outputChannel.clear();
        outputChannel.appendLine("=== Docker Output ===");
        outputChannel.appendLine(result.stdout);
        outputChannel.appendLine("=== End Output ===");
        outputChannel.show();
      }

      console.log(`Successfully ran file with Docker: ${relativeFilePath}`);
      vscode.window.showInformationMessage(
        `File executed with Docker: ${relativeFilePath}`
      );
    } catch (error) {
      console.error(`Error running file with Docker: ${error}`);
      vscode.window.showErrorMessage(
        `Failed to run file with Docker: ${error}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in runCurrentFile:", error);
    return false;
  }
}

class PolycodeViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private hasGitRepository: boolean = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly p2pUser: P2PUser
  ) {
    // Check git repository status
    checkGitRepository().then((hasGit) => {
      this.hasGitRepository = hasGit;
      // Send git status to webview if it's already loaded
      if (this.webview) {
        this.webview.postMessage({
          type: "gitStatus",
          hasGitRepository: hasGit,
        });
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log("Setting up sidebar webview");
    this.webview = webviewView.webview;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media", "dist"),
      ],
    };
    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.context,
      "sidebar"
    );
    hookMessages(webviewView.webview, this, this.p2pUser, this.context);

    // Send initial git status to webview with a small delay to ensure webview is ready
    setTimeout(() => {
      this.webview?.postMessage({
        type: "gitStatus",
        hasGitRepository: this.hasGitRepository,
      });
    }, 100);
  }

  sendCRDTUpdate(crdtUpdate: any) {
    if (this.webview) {
      this.webview.postMessage({
        type: "crdtUpdate",
        update: crdtUpdate,
      });
    }
  }

  setSidebarSize(size: string | number) {
    if (this.webview) {
      this.webview.postMessage({
        type: "setSidebarSize",
        size: size,
      });
    }
  }

  sendP2PStatus(p2pUser: P2PUser) {
    if (this.webview) {
      this.webview.postMessage({
        type: "p2pStatus",
        isConnected: p2pUser.isConnected(),
        isReady: p2pUser.isReady(),
        peerCount: p2pUser.getPeerCount(),
        peerId: p2pUser.getPeerId(),
        clientId: p2pUser.getClientId(),
        peers: p2pUser.getConnectedPeers(),
      });
    }
  }

  sendDockerStatus(status: {
    dockerEnabled: boolean;
    supportedLanguages: string[];
    containerExists: boolean;
  }) {
    if (this.webview) {
      this.webview.postMessage({
        type: "dockerStatus",
        ...status,
      });
    }
  }
}

function hookMessages(
  webview: vscode.Webview,
  provider?: PolycodeViewProvider,
  p2pUser?: P2PUser,
  context?: vscode.ExtensionContext
) {
  console.log("Setting up message handler for webview");
  console.log("Webview instance:", webview);
  webview.onDidReceiveMessage((msg) => {
    console.log("Extension received message:", msg);
    console.log("Message type:", msg?.type);

    if (msg?.type === "toast") {
      vscode.window.showInformationMessage(String(msg.text ?? ""));
    }
    if (msg?.type === "runCommand" && typeof msg.command === "string") {
      vscode.commands.executeCommand(msg.command);
    }
    if (msg?.type === "setUserName" && typeof msg.userName === "string") {
      // Store the user name and broadcast it to peers
      if (p2pUser) {
        p2pUser.setUserName(msg.userName);
        p2pUser.broadcastMessage({
          type: "userNameUpdate",
          userName: msg.userName,
          clientId: p2pUser.getClientId(),
          timestamp: Date.now(),
        });
      }
    }
    if (msg?.type === "executeShell" && typeof msg.script === "string") {
      const { exec } = require("child_process");
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const fullScript = `cd "${workspaceRoot}" && ${msg.script}`;
      console.log(`Executing: ${fullScript}`);

      exec(fullScript, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Error executing shell command: ${error}`);
          vscode.window.showErrorMessage(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
        vscode.window.showInformationMessage(
          `Shell command executed successfully`
        );

        // If this was a save command, notify other peers to sync
        if (msg.script.includes("git checkout -b Saving") && p2pUser) {
          console.log("Save completed, notifying peers to sync...");
          p2pUser.broadcastMessage({
            type: "syncRequest",
            message: "Please sync your workspace",
            timestamp: Date.now(),
          });
        }
      });
    }
    if (msg?.type === "testConnection") {
      console.log("Test connection received");
      webview.postMessage({
        type: "testResponse",
        data: "Extension is working!",
      });
    }
    if (msg?.type === "getEditorContent") {
      console.log("Handling getEditorContent request");
      // Send current editor content to webview
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const content = editor.document.getText();
        console.log(
          "Sending editor content to webview, length:",
          content.length
        );
        webview.postMessage({
          type: "editorContent",
          content: content,
        });
      } else {
        console.log("No active editor found");
        webview.postMessage({
          type: "editorContent",
          content: "No active editor",
        });
      }
    }
    if (msg?.type === "insertText" && typeof msg.text === "string") {
      console.log("Handling insertText request:", msg.text);

      // Insert text at the current cursor position
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = editor.selection.active;

        editor
          .edit((editBuilder) => {
            editBuilder.insert(position, msg.text);
          })
          .then((success) => {
            if (success) {
              console.log("Text inserted successfully at cursor position");
            } else {
              console.log("Failed to insert text");
            }
          });
      } else {
        console.log("No active editor found");
      }
    }
    if (msg?.type === "applyCRDTUpdates" && msg.updates) {
      console.log("Applying CRDT updates from P2P network");
      applyCRDTUpdatesToFile(msg.updates);
    }
    if (msg?.type === "saveToGitHub" && p2pUser) {
      const commitMessage = msg.commitMessage || "Auto-save from PolyCode";
      console.log("Saving to GitHub with message:", commitMessage);
      p2pUser.saveToGitHub(commitMessage).then((success) => {
        if (success) {
          webview.postMessage({
            type: "githubSaveResult",
            success: true,
            message: "Successfully saved to GitHub",
          });
        } else {
          webview.postMessage({
            type: "githubSaveResult",
            success: false,
            message: "Failed to save to GitHub",
          });
        }
      });
    }
    if (msg?.type === "syncFromGitHub" && p2pUser) {
      console.log("Syncing from GitHub");
      p2pUser.syncFromGitHub().then((success) => {
        if (success) {
          webview.postMessage({
            type: "githubSyncResult",
            success: true,
            message: "Successfully synced from GitHub",
          });
        } else {
          webview.postMessage({
            type: "githubSyncResult",
            success: false,
            message: "Failed to sync from GitHub",
          });
        }
      });
    }
    if (msg?.type === "getP2PStatus" && p2pUser) {
      // Send a ping to help identify peers
      p2pUser.identifyPeers().catch(console.error);

      webview.postMessage({
        type: "p2pStatus",
        isConnected: p2pUser.isConnected(),
        isReady: p2pUser.isReady(),
        peerCount: p2pUser.getPeerCount(),
        peerId: p2pUser.getPeerId(),
        clientId: p2pUser.getClientId(),
        peers: p2pUser.getConnectedPeers(),
      });
    }
    if (msg?.type === "pingPeers" && p2pUser) {
      console.log("Pinging peers with message:", msg.message);
      p2pUser.pingPeers(msg.message || "Test ping").catch(console.error);
    }
    if (msg?.type === "sendTestMessage" && p2pUser) {
      console.log("Sending test message:", msg.message);
      p2pUser.sendTestMessage(msg.message || "I LOVE YOU").catch(console.error);
    }
    if (msg?.type === "sendResponseMessage" && p2pUser) {
      console.log("Sending response message:", msg.message);
      p2pUser
        .sendResponseMessage(msg.message || "I LOVE YOU TOO")
        .catch(console.error);
    }
    if (msg?.type === "setupConfirm" && typeof msg.githubUrl === "string") {
      console.log("Setup confirmed with GitHub URL:", msg.githubUrl);

      // Execute git clone command
      const { exec } = require("child_process");
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const cloneCommand = `cd "${workspaceRoot}" && git clone ${msg.githubUrl} .`;
      console.log(`Executing git clone: ${cloneCommand}`);

      exec(cloneCommand, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Error cloning repository: ${error}`);
          vscode.window.showErrorMessage(
            `Failed to clone repository: ${error.message}`
          );
          return;
        }
        if (stderr) {
          console.log(`Git clone stderr: ${stderr}`);
        }
        console.log(`Git clone stdout: ${stdout}`);
        vscode.window.showInformationMessage(
          `Successfully cloned repository: ${msg.githubUrl}`
        );

        // Notify the webview that setup is complete
        webview.postMessage({
          type: "setupComplete",
          success: true,
          message: "Repository cloned successfully",
        });
      });
    }
    if (msg?.type === "dockerSetup" && msg.enabled && msg.languages) {
      console.log(
        "Docker setup confirmed with languages:",
        msg.languages,
        "rebuild:",
        msg.rebuild
      );
      if (context) {
        setupDockerProject(msg.languages, context, msg.rebuild).then(
          (success) => {
            if (success) {
              const action = msg.rebuild ? "updated" : "completed";
              vscode.window.showInformationMessage(
                `Docker setup ${action} for languages: ${msg.languages.join(
                  ", "
                )}`
              );
            } else {
              const action = msg.rebuild ? "update" : "setup";
              vscode.window.showErrorMessage(
                `Failed to ${action} Docker project structure`
              );
            }
          }
        );
      } else {
        vscode.window.showErrorMessage("Extension context not available");
      }
    }
    if (msg?.type === "getDockerStatus") {
      console.log("Getting Docker status");
      if (context) {
        getDockerStatus(context).then((status) => {
          provider?.sendDockerStatus(status);
        });
      }
    }
    if (msg?.type === "runFile") {
      console.log("Run file request received");
      if (context) {
        runCurrentFile(context).then((success) => {
          if (!success) {
            vscode.window.showErrorMessage("Failed to run file");
          }
        });
      } else {
        vscode.window.showErrorMessage("Extension context not available");
      }
    }
  });
}

function getWebviewHtml(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  flavor: "sidebar" | "panel"
) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(ctx.extensionUri, "media", "dist", "main.js")
  );
  const nonce = getNonce();

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https:`,
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PolyCode ${flavor === "sidebar" ? "Sidebar" : "Panel"}</title>
</head>
<body>
  <div id="root" data-flavor="${flavor}"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function createCRDTUpdate(event: vscode.TextDocumentChangeEvent) {
  const timestamp = Date.now();

  // Convert absolute path to relative path for cross-computer syncing
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  let documentPath = event.document.uri.toString();

  if (workspaceFolder) {
    const workspaceUri = workspaceFolder.uri.toString();
    if (documentPath.startsWith(workspaceUri)) {
      // Convert to relative path
      const relativePath = documentPath.substring(workspaceUri.length + 1); // +1 to remove leading slash
      documentPath = relativePath;
    }
  }

  const updates = event.contentChanges.map((change, index) => {
    const update: any = {
      id: `${timestamp}-${index}`,
      timestamp,
      type: "text_change",
      position: {
        line: change.range.start.line,
        character: change.range.start.character,
      },
      range: {
        start: {
          line: change.range.start.line,
          character: change.range.start.character,
        },
        end: {
          line: change.range.end.line,
          character: change.range.end.character,
        },
      },
    };

    if (change.text) {
      // Insert operation
      update.operation = "insert";
      update.text = change.text;
    } else if (change.rangeLength > 0) {
      // Delete operation
      update.operation = "delete";
      update.length = change.rangeLength;
    }

    return update;
  });

  return {
    document: documentPath, // Use relative path instead of absolute URI
    timestamp,
    updates,
    clientId: CLIENT_ID, // Add client ID to identify the source
  };
}

async function applyCRDTUpdatesToFile(updates: any[]) {
  try {
    // Set flag to prevent infinite loops
    isApplyingCRDTUpdate = true;

    // Extract the document URI from the first update (all updates should be for the same file)
    if (!updates || updates.length === 0) {
      console.error("No updates provided to applyCRDTUpdatesToFile");
      isApplyingCRDTUpdate = false;
      return;
    }

    // Filter out updates that originated from this client to prevent feedback loops
    const filteredUpdates = updates.filter((update) => {
      if (update.clientId === CLIENT_ID) {
        console.log("Skipping CRDT update from same client:", update.clientId);
        return false;
      }
      return true;
    });

    if (filteredUpdates.length === 0) {
      console.log("All CRDT updates filtered out (from same client)");
      isApplyingCRDTUpdate = false;
      return;
    }

    const documentPath = filteredUpdates[0].document;
    if (!documentPath) {
      console.error("No document path found in CRDT updates");
      isApplyingCRDTUpdate = false;
      return;
    }

    // Resolve relative path to absolute URI
    let targetUri: vscode.Uri;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (documentPath.startsWith("file://")) {
      // Already an absolute URI
      targetUri = vscode.Uri.parse(documentPath);
    } else {
      // Relative path - resolve against workspace root
      if (workspaceFolder) {
        targetUri = vscode.Uri.joinPath(workspaceFolder.uri, documentPath);
      } else {
        // Fallback to current working directory
        targetUri = vscode.Uri.file(documentPath);
      }
    }

    // Check if file exists, only open if it does
    let targetDocument: vscode.TextDocument;
    try {
      // First check if the file exists
      await vscode.workspace.fs.stat(targetUri);
      // File exists, open it
      targetDocument = await vscode.workspace.openTextDocument(targetUri);
    } catch (error) {
      // File doesn't exist, skip this update
      console.log(
        `File ${targetUri.fsPath} doesn't exist, skipping CRDT update`
      );
      isApplyingCRDTUpdate = false;
      return;
    }

    // Open the target file in an editor
    const editor = await vscode.window.showTextDocument(targetDocument);

    // Apply all updates in chronological order
    for (const update of filteredUpdates) {
      for (const operation of update.updates) {
        await applyCRDTOperation(editor, operation);
      }
    }

    vscode.window.showInformationMessage(
      `Applied ${filteredUpdates.length} CRDT updates to ${targetUri.fsPath}`
    );
  } catch (error) {
    console.error("Error applying CRDT updates:", error);
    vscode.window.showErrorMessage(`Failed to apply CRDT updates: ${error}`);
  } finally {
    // Always reset the flag to allow future document changes
    isApplyingCRDTUpdate = false;
  }
}

let activeCursorDecorations: vscode.TextEditorDecorationType[] = [];

async function applyCRDTOperation(editor: vscode.TextEditor, operation: any) {
  return new Promise<void>((resolve) => {
    const position = new vscode.Position(
      operation.position.line,
      operation.position.character
    );

    activeCursorDecorations.forEach((d) => {
      editor.setDecorations(d, []);
      d.dispose();
    });
    activeCursorDecorations = [];

    const decorationType = vscode.window.createTextEditorDecorationType({
      borderStyle: "solid",
      borderColor: "red",
      borderWidth: "1px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    editor.setDecorations(decorationType, [
      new vscode.Range(position, position),
    ]);
    activeCursorDecorations.push(decorationType);

    editor
      .edit((editBuilder) => {
        if (operation.operation === "insert" && operation.text) {
          editBuilder.insert(position, operation.text);
        } else if (operation.operation === "delete" && operation.length) {
          const endPosition = new vscode.Position(
            operation.range.end.line,
            operation.range.end.character
          );
          const range = new vscode.Range(position, endPosition);
          editBuilder.delete(range);
        }
      })
      .then(() => {
        resolve();
      });
  });
}
