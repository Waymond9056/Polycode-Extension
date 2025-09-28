## Inspiration
The greatest part of a hackathon is stressing over code together. But that's hard to do when everyone is working on different versions of the code, bracing for the inevitable merge conflicts and "works on my machine" when mashing the code together. Indeed, in these small group settings when source control is not the priority, it would be much better if everyone could work synchronously on the same version of the codebase.

## What it does
PolyCode is a VSCode extension that allows you to synchronously work together on a codebase. Edits from one user are automatically applied to the project files of all users. This allows users to be able to run all of their code on their own machine, taking advantage of completed project features without needing to wait for GitHub.

This is not to say PolyCode is trying to replace GitHub. In fact, PolyCode actually uses GitHub to save project checkpoints in the cloud, allowing users to pull the updates since their last session and seamlessly start editing again.

Of course, with code now accessible on everyone's computer, we want to make sure it is actually runnable on everyone's computers. To do this, PolyCode is integrated with Docker to provide a standardized runtime environment to make sure all users are testing their code with the same system requirements.

## Comparison with alternatives
We thought to ourselves that collaborative coding must have been invented already. But it turns out, the current marketplace tools fall short in several places.
+ There's the online hosted ones such as Replit or CoderPad. However, these are inherently limited by being web-based. Imagine you are an interviewer trying to gauge how a dev works in his own IDE ecosystem. PolyCode provides that functionality while CoderPad pigeonholes you into its own interface.
+ There's also an extension called LiveShare. The main problem with this is that it requires a host computer to share their terminals and code. When the host leaves, so do your code changes. PolyCode is fundamentally peer-to-peer meaning that there is no reliance on anyone in the network. When someone leaves, their changes are already on everyone's computers.

## How we built it
PolyCode is primarily a TypeScript/JavaScript based VS Code extension that can read and write to files directly. The frontend is built using React webviews, utilizing VS Code native React components. We used CRDT data structures to keep track of simultaneous document changes (insertions, deletions) efficiently. We used Hyperswarm to find and network other nodes in a peer to peer architecture, removing the need for a centralized server. We use GitHub to save project checkpoints, and integrated with Docker to ensure a standardized runtime environment. 

## Challenges we ran into
We ran into many interesting challenges during this Hackathon. Most notably, the problem of sending CRDT information between nodes on a serverless network. Due to the nature of P2P structures, "echoes" occurred where a node would receive data that had been sent into the network earlier by itself. We had to implement a id-checking system to resolve this.

Git was also surprisingly difficult to work with. Since Git was designed for single users on a tree-based worktree, merging multiple synchronous sessions into a single version history basically turns Git on its head. We had to come up with clever rebasing schemes to ensure all git version could be merged into the main branch.

## Accomplishments that we're proud of
We're proud of getting the project to work! Coming into the hackathon, we barely knew anything about networking, CRDTs, Docker, and many other necessary tools. We are proud of all the learning we did and all the bugs we had to push through.

On a more personal level, this was the first hackathon where we forced ourselves out of the usual library study room. It was great to interact with the other half of the hackathon, whether that was singing our hearts out at karaoke, answering fun questions at Impiricus' workshop, or watching that banger performance by Seoulstice.

## What we learned
There were many technologies in the creation of this project that we were completely new to, including networking (especially peer to peer) using Hyperswarm, making a VS Code extension (which was surprisingly painless), and creating Docker images for centralized runtime. Picking up new technologies quickly is an incredibly important asset in hackathons, and being a good developer. And, probably don't eat 2x spicy Buldak at 2 am.

## What's next for PolyCode
PolyCode has a lot of room for improvement. Whether it is features we did not have time to implement, or were outside the scope of the project, we thought of countless ways to make this product more appealing. For one, we want to allow users to configure their own Docker images to centralize program runtime, to allow instantaneous integration and limit the barrier for entry as much as possible. AI copilot-type tools have become essential for developer productivity today, and a collaborative coding tool would not be complete without support for a collaboratively used AI agent. This, along with making our program failsafe and providing encryption and proper syncing, are all future directions for the developement of PolyCode.
