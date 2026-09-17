# Largest digit within an integer value

In this problem, you will use a combination of iteration, the modulo operator, and the division operator to extract the individual digits comprising an integer value. During this process, you will keep track of the largest digit you have observed. At the end of the process, you will return the largest digit to the caller.

You will write your solution to this problem within the body of `LargestDigit`. I understand that we haven't discussed functions in detail yet. You need to know that our auto-grader will invoke your implementation (the code within the function body) of `LargestDigit` with different arguments that will become stored in the parameter `number`. Your solution should be written with respect to `number`.

To summarize, you are to find the largest digit within `number`. For example, if our auto-grader calls `LargestDigit(1234)`, your solution should return `4`. Likewise, for `LargestDigit(784)`, your implementation would return `8`.

You will define `LargestDigit` in `fun.cc`. You can test your implementation in `driver.cc` by calling `LargestDigit` with different arguments.

Consider only the cases where the parameter `number` is greater than or equal to zero.

## Testing Your Code

Run `make` to build the driver, then `./main` to try it out. Run `make test` to run the grader.
