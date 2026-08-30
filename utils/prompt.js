import * as readline from "node:readline";

export async function prompt(question, validAnswers = null, argMap = null) {
	// Check for pre-answered argument
	if (argMap) {
		for (const [arg, value] of Object.entries(argMap)) {
			if (process.argv.includes(arg)) {
				// Validate the answer
				if (validAnswers && !validAnswers.includes(value.toLowerCase())) {
					console.log(
						`Invalid answer from argument. Valid options: ${validAnswers.join(", ")}`,
					);
					break; // Fall through to interactive prompt
				}
				return value;
			}
		}
	}

	// Interactive prompt
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		const askQuestion = () => {
			rl.question(question, (answer) => {
				if (validAnswers && !validAnswers.includes(answer.toLowerCase())) {
					console.log(
						`Invalid answer. Valid options: ${validAnswers.join(", ")}`,
					);
					askQuestion();
					return;
				}
				rl.close();
				resolve(answer);
			});
		};
		askQuestion();
	});
}
