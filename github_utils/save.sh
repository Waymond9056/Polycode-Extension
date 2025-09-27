#!/bin/bash
git checkout -b Saving
git add *
git commit -m "Saving"
git checkout main
git merge Saving
git branch -d Saving
git push

