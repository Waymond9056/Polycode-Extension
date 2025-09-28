import java.util.Arrays;

public class test {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
        System.out.println("This is a test script running inside the Docker container.");
        System.out.println("Java version: " + System.getProperty("java.version"));

        // Simple calculation to show it's working
        int[] numbers = {1, 2, 3, 4, 5};
        int total = 0;
        for (int number : numbers) {
            total += number;
        }
        System.out.println("Sum of " + Arrays.toString(numbers) + " = " + total);
    }
}