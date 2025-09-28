import * as fs from 'fs';

let java : boolean = true;
let python : boolean = true;
let typescript : boolean = false;

// Create needed files
let docker_files : string[] = ["setup_files/docker_head.txt"]
let sh_files : string[] = ["setup_files/sh_head.txt"]
if (java) {
    docker_files.push("setup_files/docker_java.txt");
    sh_files.push("setup_files/sh_java.txt");
}
if (python) {
    docker_files.push("setup_files/docker_python.txt");
    sh_files.push("setup_files/sh_python.txt");
}
if (typescript) {
    docker_files.push("setup_files/docker_ts.txt");
    sh_files.push("setup_files/sh_typescript.txt");
}
docker_files.push("setup_files/docker_tail.txt");
sh_files.push("setup_files/sh_tail.txt");

// Create the docker file
let combined_docker = '';
for (const file of docker_files) {
    try {
        const content = fs.readFileSync(file, 'utf-8');
        combined_docker += content + '\n'; // Add a newline for separation
    } catch (error) {
        console.error(`Error reading file ${file}:`, error);
    }
}

try {
    fs.writeFileSync("DockerContainer/Dockerfile", combined_docker, 'utf-8');
    console.log(`Files successfully concatenated dockerfile...`);
} catch (error) {
    console.error(`Error writing to output file`, error);
}

// Create the sh file
let combined_sh = '';
for (const file of sh_files) {
    try {
        const content = fs.readFileSync(file, 'utf-8');
        combined_sh += content + '\n'; // Add a newline for separation
    } catch (error) {
        console.error(`Error reading file ${file}:`, error);
    }
}

try {
    fs.writeFileSync("DockerContainer/entrypoint2.sh", combined_sh, 'utf-8');
    console.log(`Files successfully concatenated sh file...`);
} catch (error) {
    console.error(`Error writing to output file`, error);
}


