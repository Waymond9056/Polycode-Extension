#!/usr/bin/env python3

print("Hello from Python!")
print("This is a test script running inside the Docker container.")
print(f"Python version: {__import__('sys').version}")

# Simple calculation to show it's working
numbers = [1, 2, 3, 4, 5]
total = sum(numbers)
print(f"Sum of {numbers} = {total}")

# Show current working directory
import os
print(f"Current working directory: {os.getcwd()}")

print("Test completed successfully!")
