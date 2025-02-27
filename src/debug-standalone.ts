import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Simple implementation of CommitInfo interface
interface CommitInfo {
    hash: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    files: string[];
}

async function main() {
    try {
        console.log('Starting debug script');
        
        // Get the repository path
        const repoPath = process.cwd();
        console.log(`Repository path: ${repoPath}`);
        
        // Check if path exists
        if (!fs.existsSync(repoPath)) {
            console.error(`Repository path does not exist: ${repoPath}`);
            return;
        }
        
        // Check if .git directory exists
        const gitDir = path.join(repoPath, '.git');
        const hasGitDir = fs.existsSync(gitDir);
        console.log(`.git directory exists: ${hasGitDir}`);
        
        if (!hasGitDir) {
            console.error(`Not a git repository - .git directory not found in ${repoPath}`);
            return;
        }
        
        // Check if git is installed
        try {
            const { stdout: gitVersion } = await execAsync('git --version');
            console.log(`Git version: ${gitVersion.trim()}`);
        } catch (error) {
            console.error(`Error checking git version: ${error}`);
            return;
        }
        
        // Check repository status
        try {
            const { stdout: gitStatus } = await execAsync('git status');
            console.log(`Git status: ${gitStatus.trim().split('\n')[0]}`);
        } catch (error) {
            console.error(`Error checking git status: ${error}`);
            return;
        }
        
        // Get commits
        try {
            console.log('Getting commits...');
            const maxCount = 10;
            const { stdout, stderr } = await execAsync(`git log --pretty=format:"%H|%an|%ae|%ad|%s" -n ${maxCount}`);
            
            if (stderr) {
                console.error(`Git command stderr: ${stderr}`);
            }
            
            if (!stdout) {
                console.log('No output from git command');
                return;
            }
            
            console.log(`Raw git command returned ${stdout.split('\n').length} lines`);
            
            // Parse the raw output
            const commits: CommitInfo[] = stdout.split('\n').map(line => {
                const parts = line.split('|');
                return {
                    hash: parts[0] || '',
                    author: parts[1] || '',
                    authorEmail: parts[2] || '',
                    date: parts[3] || '',
                    message: parts[4] || '',
                    files: []
                };
            });
            
            console.log(`Parsed ${commits.length} commits`);
            
            if (commits.length > 0) {
                console.log('\nCommits:');
                commits.forEach((commit, index) => {
                    console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
                });
            }
        } catch (error) {
            console.error(`Error getting commits: ${error}`);
        }
        
        // Get branches
        try {
            console.log('\nGetting branches...');
            const { stdout: branchesOutput } = await execAsync('git branch');
            const branches = branchesOutput.trim().split('\n').map(b => b.trim().replace(/^\*\s*/, ''));
            console.log(`Found ${branches.length} branches: ${branches.join(', ')}`);
        } catch (error) {
            console.error(`Error getting branches: ${error}`);
        }
        
        console.log('\nDebug script completed successfully');
    } catch (error) {
        console.error(`Error in debug script: ${error}`);
    }
}

main().catch(error => {
    console.error(`Unhandled error in main: ${error}`);
});
