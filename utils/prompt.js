import * as readline from 'readline';

export async function prompt(question, validAnswers = null) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		const askQuestion = () => {
			rl.question(question, (answer) => {
				if (validAnswers && !validAnswers.includes(answer.toLowerCase())) {
					console.log(`Invalid answer. Valid options: ${validAnswers.join(', ')}`);
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
