#!/usr/bin/env node
const agent = require('superagent')
const cheerio = require('cheerio')
const program = require('commander')
const inquirer = require('inquirer')
// const db = require('sqlite')
const fs = require('fs')

program
  .version('1.0.0')
  .option('-s, --search', 'Lance la recherche d\'annonces')

program.parse(process.argv)

if (program.search) {
  inquirer.prompt([
    {
      type: 'input',
      message: 'Entrez le mot clé à rechercher : ',
      name: 'keyword'
    }
  ]).then((answers) => {
    var url = 'https://www.leboncoin.fr/annonces/offres/aquitaine/?th=1&q=' + answers.keyword + '&parrot=0'
    agent
      .get(url)
      .end(function(err, res){
        if(err) {
          console.log("Error: " + err);
        }
        console.log('Status code: ', res.statusCode);
        if(res.statusCode === 200) {
          console.log(res);
          let $ = cheerio.load(res.text)
          let count = 0
          $('.tabsContent ul li a').each(function() {
            console.log($(this).attr('href'));
            count++
          })
          console.log(count);
        }
      });
  })
} else {
  program.help()
}
