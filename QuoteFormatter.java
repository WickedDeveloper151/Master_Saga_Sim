import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class QuoteFormatter {
    public static void main(String[] args) {
        System.out.println("Copy the block of text from yugipedia that shows whats in the pack and paste it here. Press Enter to finish input:");
        
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();
        
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
                // Automatically stop once the pasted block finishes
                if (!reader.ready()) {
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        String rawText = sb.toString();
        
        // Find all Strings in double quotes and print them in the desired format
        Pattern pattern = Pattern.compile("\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(rawText);

        System.out.println("\n--- Formatted Output ---");
        boolean found = false;
        while (matcher.find()) {
            System.out.println("\"" + matcher.group(1) + "\",");
            found = true;
        }

        if (!found) {
            System.out.println("No quoted items found.");
        }
    }
}