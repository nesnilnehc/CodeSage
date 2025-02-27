import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitService } from './gitService';

const execAsync = promisify(exec);

async function runGitCommand(command: string, cwd: string): Promise<string> {
    try {
        console.log(`Running command: ${command}`);
        const { stdout } = await execAsync(command, { cwd });
        return stdout;
    } catch (error) {
        console.error(`Error running command: ${command}`);
        console.error(error);
        return `ERROR: ${error}`;
    }
}

async function checkGitConfig(repoPath: string) {
    console.log('\n--- Checking Git Configuration ---');
    
    // Check global git config
    console.log('\nGlobal Git config:');
    await runGitCommand('git config --global --list', repoPath);
    
    // Check local git config
    console.log('\nLocal Git config:');
    await runGitCommand('git config --local --list', repoPath);
    
    // Check git version
    console.log('\nGit version:');
    await runGitCommand('git --version', repoPath);
}

async function checkGitRemotes(repoPath: string) {
    console.log('\n--- Checking Git Remotes ---');
    
    // List remotes
    console.log('\nGit remotes:');
    await runGitCommand('git remote -v', repoPath);
    
    // Check remote branches
    console.log('\nRemote branches:');
    await runGitCommand('git branch -r', repoPath);
}

async function checkGitHooks(repoPath: string) {
    console.log('\n--- Checking Git Hooks ---');
    
    const hooksDir = path.join(repoPath, '.git', 'hooks');
    if (fs.existsSync(hooksDir)) {
        const hooks = fs.readdirSync(hooksDir);
        console.log(`Found ${hooks.length} hooks:`);
        hooks.forEach(hook => {
            const hookPath = path.join(hooksDir, hook);
            const stats = fs.statSync(hookPath);
            const isExecutable = (stats.mode & 0o111) !== 0;
            console.log(`- ${hook} (executable: ${isExecutable})`);
        });
    } else {
        console.log('Hooks directory not found');
    }
}

async function checkGitIgnore(repoPath: string) {
    console.log('\n--- Checking .gitignore ---');
    
    const gitignorePath = path.join(repoPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        console.log('.gitignore content:');
        console.log(gitignore);
    } else {
        console.log('.gitignore file not found');
    }
}

async function checkGitAttributes(repoPath: string) {
    console.log('\n--- Checking .gitattributes ---');
    
    const gitattributesPath = path.join(repoPath, '.gitattributes');
    if (fs.existsSync(gitattributesPath)) {
        const gitattributes = fs.readFileSync(gitattributesPath, 'utf8');
        console.log('.gitattributes content:');
        console.log(gitattributes);
    } else {
        console.log('.gitattributes file not found');
    }
}

async function checkGitModules(repoPath: string) {
    console.log('\n--- Checking .gitmodules ---');
    
    const gitmodulesPath = path.join(repoPath, '.gitmodules');
    if (fs.existsSync(gitmodulesPath)) {
        const gitmodules = fs.readFileSync(gitmodulesPath, 'utf8');
        console.log('.gitmodules content:');
        console.log(gitmodules);
        
        // Check submodules
        console.log('\nSubmodules:');
        await runGitCommand('git submodule status', repoPath);
    } else {
        console.log('.gitmodules file not found');
    }
}

async function testGitService(repoPath: string) {
    console.log('\n--- Testing GitService with Repository ---');
    
    const gitService = new GitService();
    await gitService.setRepository(repoPath);
    
    // Test isGitRepository
    const isRepo = await gitService.isGitRepository();
    console.log(`Is Git repository: ${isRepo}`);
    
    // Test getting branches
    console.log('\nGetting branches:');
    const branches = await gitService.getBranches();
    console.log(`Found ${branches.length} branches:`);
    branches.forEach(branch => console.log(`- ${branch}`));
    
    // Test getting commits with different methods
    console.log('\nGetting commits with simple-git:');
    const simpleGitCommits = await gitService.getCommitsWithSimpleGit({});
    console.log(`Found ${simpleGitCommits.length} commits with simple-git`);
    
    console.log('\nGetting commits with direct command:');
    const directCommits = await gitService.getCommitsWithDirectCommand({});
    console.log(`Found ${directCommits.length} commits with direct command`);
    
    // Compare results
    console.log('\nComparing results:');
    console.log(`Simple-git commits: ${simpleGitCommits.length}`);
    console.log(`Direct command commits: ${directCommits.length}`);
    
    // Check if the commits match
    const simpleGitHashes = simpleGitCommits.map(c => c.hash);
    const directHashes = directCommits.map(c => c.hash);
    
    const onlyInSimpleGit = simpleGitHashes.filter(hash => !directHashes.includes(hash));
    const onlyInDirect = directHashes.filter(hash => !simpleGitHashes.includes(hash));
    
    console.log(`Commits only in simple-git: ${onlyInSimpleGit.length}`);
    console.log(`Commits only in direct command: ${onlyInDirect.length}`);
    
    if (onlyInSimpleGit.length > 0) {
        console.log('\nCommits only in simple-git:');
        onlyInSimpleGit.forEach(hash => {
            const commit = simpleGitCommits.find(c => c.hash === hash);
            if (commit) {
                console.log(`- ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
            }
        });
    }
    
    if (onlyInDirect.length > 0) {
        console.log('\nCommits only in direct command:');
        onlyInDirect.forEach(hash => {
            const commit = directCommits.find(c => c.hash === hash);
            if (commit) {
                console.log(`- ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
            }
        });
    }
}

async function main() {
    console.log('Starting Git repository debug script');
    
    // Get repository path
    const repoPath = process.cwd();
    console.log(`Repository path: ${repoPath}`);
    
    // Check if .git directory exists
    const gitDir = path.join(repoPath, '.git');
    const gitDirExists = fs.existsSync(gitDir);
    console.log(`.git directory exists: ${gitDirExists}`);
    
    if (!gitDirExists) {
        console.error('Not a git repository - .git directory not found');
        return;
    }
    
    // Check Git configuration
    await checkGitConfig(repoPath);
    
    // Check Git remotes
    await checkGitRemotes(repoPath);
    
    // Check Git hooks
    await checkGitHooks(repoPath);
    
    // Check .gitignore
    await checkGitIgnore(repoPath);
    
    // Check .gitattributes
    await checkGitAttributes(repoPath);
    
    // Check .gitmodules
    await checkGitModules(repoPath);
    
    // Test GitService
    await testGitService(repoPath);
    
    console.log('\nGit repository debug script completed');
}

main().catch(error => {
    console.error('Error in debug script:', error);
});
