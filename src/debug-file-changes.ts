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

async function getFileChangesWithGitShow(repoPath: string, commitHash: string): Promise<string[]> {
    try {
        const command = `git show --name-only --pretty=format: ${commitHash}`;
        const output = await runGitCommand(command, repoPath);
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error(`Error getting file changes with git show: ${error}`);
        return [];
    }
}

async function getFileChangesWithGitDiff(repoPath: string, commitHash: string): Promise<string[]> {
    try {
        const command = `git diff-tree --no-commit-id --name-only -r ${commitHash}`;
        const output = await runGitCommand(command, repoPath);
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error(`Error getting file changes with git diff-tree: ${error}`);
        return [];
    }
}

async function getFileChangesWithGitLogP(repoPath: string, commitHash: string): Promise<string[]> {
    try {
        const command = `git log -1 --name-only --pretty=format: ${commitHash}`;
        const output = await runGitCommand(command, repoPath);
        return output.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error(`Error getting file changes with git log -p: ${error}`);
        return [];
    }
}

async function getFileChangesWithSimpleGit(repoPath: string, commitHash: string): Promise<string[]> {
    try {
        const gitService = new GitService();
        await gitService.setRepository(repoPath);
        return await gitService.getFilesForCommit(commitHash);
    } catch (error) {
        console.error(`Error getting file changes with simple-git: ${error}`);
        return [];
    }
}

async function getCommitDetails(repoPath: string, commitHash: string): Promise<void> {
    console.log(`\n--- Getting details for commit ${commitHash} ---`);
    
    // Get commit details
    const command = `git show --pretty=format:"%h|%ad|%an|%ae|%s" --date=iso ${commitHash}`;
    const output = await runGitCommand(command, repoPath);
    const [hash, date, author, email, ...messageParts] = output.split('|');
    const message = messageParts.join('|');
    
    console.log(`Commit: ${hash}`);
    console.log(`Date: ${date}`);
    console.log(`Author: ${author} <${email}>`);
    console.log(`Message: ${message}`);
    
    // Get file changes using different methods
    console.log('\nFile changes using git show:');
    const filesWithShow = await getFileChangesWithGitShow(repoPath, commitHash);
    console.log(`Found ${filesWithShow.length} files:`);
    filesWithShow.forEach(file => console.log(`- ${file}`));
    
    console.log('\nFile changes using git diff-tree:');
    const filesWithDiff = await getFileChangesWithGitDiff(repoPath, commitHash);
    console.log(`Found ${filesWithDiff.length} files:`);
    filesWithDiff.forEach(file => console.log(`- ${file}`));
    
    console.log('\nFile changes using git log:');
    const filesWithLog = await getFileChangesWithGitLogP(repoPath, commitHash);
    console.log(`Found ${filesWithLog.length} files:`);
    filesWithLog.forEach(file => console.log(`- ${file}`));
    
    console.log('\nFile changes using simple-git:');
    const filesWithSimpleGit = await getFileChangesWithSimpleGit(repoPath, commitHash);
    console.log(`Found ${filesWithSimpleGit.length} files:`);
    filesWithSimpleGit.forEach(file => console.log(`- ${file}`));
    
    // Compare results
    console.log('\nComparing results:');
    console.log(`git show: ${filesWithShow.length} files`);
    console.log(`git diff-tree: ${filesWithDiff.length} files`);
    console.log(`git log: ${filesWithLog.length} files`);
    console.log(`simple-git: ${filesWithSimpleGit.length} files`);
    
    // Check if all methods return the same files
    const allMethods = [
        { name: 'git show', files: filesWithShow },
        { name: 'git diff-tree', files: filesWithDiff },
        { name: 'git log', files: filesWithLog },
        { name: 'simple-git', files: filesWithSimpleGit }
    ];
    
    for (let i = 0; i < allMethods.length; i++) {
        for (let j = i + 1; j < allMethods.length; j++) {
            const method1 = allMethods[i];
            const method2 = allMethods[j];
            
            const onlyInMethod1 = method1.files.filter(file => !method2.files.includes(file));
            const onlyInMethod2 = method2.files.filter(file => !method1.files.includes(file));
            
            console.log(`\nComparing ${method1.name} vs ${method2.name}:`);
            console.log(`Files only in ${method1.name}: ${onlyInMethod1.length}`);
            console.log(`Files only in ${method2.name}: ${onlyInMethod2.length}`);
            
            if (onlyInMethod1.length > 0) {
                console.log(`Files only in ${method1.name}:`);
                onlyInMethod1.forEach(file => console.log(`- ${file}`));
            }
            
            if (onlyInMethod2.length > 0) {
                console.log(`Files only in ${method2.name}:`);
                onlyInMethod2.forEach(file => console.log(`- ${file}`));
            }
        }
    }
}

async function main() {
    console.log('Starting file changes debug script');
    
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
    
    // Get recent commits
    console.log('\nGetting recent commits:');
    const command = 'git log -n 5 --pretty=format:"%H|%ad|%an|%s" --date=iso';
    const output = await runGitCommand(command, repoPath);
    
    const commits = output
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
            const [hash, date, author, ...messageParts] = line.split('|');
            const message = messageParts.join('|');
            return { hash, date, author, message };
        });
    
    console.log(`Found ${commits.length} commits:`);
    commits.forEach((commit, index) => {
        console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
    });
    
    // Get file changes for each commit
    for (const commit of commits) {
        await getCommitDetails(repoPath, commit.hash);
    }
    
    console.log('\nFile changes debug script completed');
}

main().catch(error => {
    console.error('Error in debug script:', error);
});
