import { GitService } from './gitService';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
    try {
        console.log('Starting commit debug script');
        
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
        
        // Try to run git log directly
        console.log('\nRunning git log directly...');
        try {
            const { stdout } = await execAsync('git log -n 5 --pretty=format:"%H|%ad|%an|%ae|%s" --date=iso', { cwd: repoPath });
            console.log('Direct git log output:');
            console.log(stdout);
            
            const lines = stdout.split('\n').filter(line => line.trim() !== '');
            console.log(`Found ${lines.length} commits directly`);
        } catch (gitError) {
            console.error(`Error running git log directly: ${gitError}`);
        }
        
        // Initialize GitService
        const gitService = new GitService();
        console.log('\nGitService initialized');
        
        // Set repository
        await gitService.setRepository(repoPath);
        console.log('Repository set');
        
        // Check if it's a git repository
        const isGitRepo = await gitService.isGitRepository();
        console.log(`Is Git repository: ${isGitRepo}`);
        
        if (isGitRepo) {
            // Try to get commits with simple-git directly
            console.log('\nTrying to get commits using simple-git directly...');
            try {
                const commits = await gitService.getCommitsWithSimpleGit({});
                console.log(`Found ${commits.length} commits with simple-git`);
                
                if (commits.length > 0) {
                    console.log('\nCommits from simple-git:');
                    commits.forEach((commit, index) => {
                        console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
                    });
                }
            } catch (simpleGitError) {
                console.error(`Error getting commits with simple-git: ${simpleGitError}`);
            }
            
            // Try to get commits with direct command
            console.log('\nTrying to get commits using direct command...');
            try {
                const commits = await gitService.getCommitsWithDirectCommand({});
                console.log(`Found ${commits.length} commits with direct command`);
                
                if (commits.length > 0) {
                    console.log('\nCommits from direct command:');
                    commits.forEach((commit, index) => {
                        console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
                    });
                }
            } catch (directCommandError) {
                console.error(`Error getting commits with direct command: ${directCommandError}`);
            }
            
            // Get commits through the normal method
            console.log('\nGetting commits through normal method...');
            try {
                const commits = await gitService.getCommits({ maxCount: 10 });
                console.log(`Found ${commits.length} commits through normal method`);
                
                if (commits.length > 0) {
                    console.log('\nCommits:');
                    commits.forEach((commit, index) => {
                        console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
                        console.log(`   Files: ${commit.files.length} files`);
                    });
                }
            } catch (commitsError) {
                console.error(`Error getting commits through normal method: ${commitsError}`);
            }
            
            // Get branches
            console.log('\nGetting branches...');
            try {
                const branches = await gitService.getBranches();
                console.log(`Found ${branches.length} branches: ${branches.join(', ')}`);
            } catch (branchesError) {
                console.error(`Error getting branches: ${branchesError}`);
            }
        }
        
        console.log('\nCommit debug script completed');
    } catch (error) {
        console.error(`Error in commit debug script: ${error}`);
    }
}

main().catch(error => {
    console.error(`Unhandled error in main: ${error}`);
});
