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

async function main() {
    console.log('Starting Git command debug script');
    
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
    
    console.log('\n--- Testing Basic Git Commands ---');
    
    // Test git status
    console.log('\nTesting git status:');
    const statusOutput = await runGitCommand('git status', repoPath);
    console.log(statusOutput);
    
    // Test git log with different formats
    console.log('\nTesting git log (default format):');
    const logOutput = await runGitCommand('git log -n 5', repoPath);
    console.log(logOutput);
    
    console.log('\nTesting git log (custom format):');
    const logCustomOutput = await runGitCommand('git log -n 5 --pretty=format:"%h|%ad|%an|%ae|%s" --date=iso', repoPath);
    console.log(logCustomOutput);
    
    // Test git show for a specific commit
    const firstCommitHash = logCustomOutput.split('\n')[0].split('|')[0];
    if (firstCommitHash) {
        console.log(`\nTesting git show for commit ${firstCommitHash}:`);
        const showOutput = await runGitCommand(`git show ${firstCommitHash}`, repoPath);
        console.log(showOutput);
        
        console.log(`\nTesting git show --name-only for commit ${firstCommitHash}:`);
        const showFilesOutput = await runGitCommand(`git show --name-only --pretty=format: ${firstCommitHash}`, repoPath);
        console.log(showFilesOutput);
    }
    
    // Test git branch
    console.log('\nTesting git branch:');
    const branchOutput = await runGitCommand('git branch', repoPath);
    console.log(branchOutput);
    
    console.log('\nTesting git branch -a:');
    const branchAllOutput = await runGitCommand('git branch -a', repoPath);
    console.log(branchAllOutput);
    
    // Test GitService methods
    console.log('\n--- Testing GitService Methods ---');
    
    const gitService = new GitService();
    await gitService.setRepository(repoPath);
    
    console.log('\nTesting getCommitsWithSimpleGit:');
    try {
        const simpleGitCommits = await gitService.getCommitsWithSimpleGit({});
        console.log(`Found ${simpleGitCommits.length} commits`);
        simpleGitCommits.forEach((commit, index) => {
            console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
            console.log(`   Files: ${commit.files.length} files`);
        });
    } catch (error) {
        console.error('Error with getCommitsWithSimpleGit:', error);
    }
    
    console.log('\nTesting getCommitsWithDirectCommand:');
    try {
        const directCommits = await gitService.getCommitsWithDirectCommand({});
        console.log(`Found ${directCommits.length} commits`);
        directCommits.forEach((commit, index) => {
            console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
            console.log(`   Files: ${commit.files.length} files`);
        });
    } catch (error) {
        console.error('Error with getCommitsWithDirectCommand:', error);
    }
    
    // Test with different filters
    console.log('\nTesting with date filter:');
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const since = oneYearAgo.toISOString().split('T')[0];
    
    try {
        const dateFilteredCommits = await gitService.getCommitsWithDirectCommand({ since });
        console.log(`Found ${dateFilteredCommits.length} commits since ${since}`);
        dateFilteredCommits.forEach((commit, index) => {
            console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
        });
    } catch (error) {
        console.error(`Error with date filter: ${error}`);
    }
    
    console.log('\nGit command debug script completed');
}

main().catch(error => {
    console.error('Error in debug script:', error);
});
