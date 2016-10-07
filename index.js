#!/usr/bin/env node
const agent = require('superagent')
const cheerio = require('cheerio')
const program = require('commander')
const inquirer = require('inquirer')
const db = require('sqlite')
const fs = require('fs')

db.open('default.db').then(()=>{
     return db.run("CREATE TABLE IF NOT EXISTS searches (keyword, title, author, price, city, description, creationDate)");
})

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
    let keyword = answers.keyword
    let arr = []
    agent
      .get(url)
      .then(function(res, err) {
        if(err) {
          console.log("Error: " + err);
        }
        console.log('Status code: ', res.statusCode);
        if(res.statusCode === 200) {
          let $ = cheerio.load(res.text)
          $('.tabsContent ul li a').each(function() {
            arr.push($(this).attr('href'))
          })
          return arr
        }
      }).then((arr) => {
        for (var i = 0, len = arr.length; i < len; i++) {
          agent
            .get('https:' + arr[i])
            .then(function(res, err) {
              if(err) {
                console.log("Error: " + err);
              }
              if(res.statusCode === 200) {
                let $ = cheerio.load(res.text)
                db.run("INSERT INTO searches VALUES (?, ?, ?, ?, ?, ?, ?)",
                        keyword,
                        $('h1.no-border').text(),
                        $('.properties div.line_pro p a').text(),
                        $('.item_price span.value').text(),
                        $('div.line_city h2 span.value').text(),
                        $('p#description').text(),
                        $('p.line_pro').text()
                );
              }
            })
        }
      })
  })
} else {
  program.help()
}
