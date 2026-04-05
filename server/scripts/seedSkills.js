/**
 * Seed initial skills into the database
 * Run this script: node scripts/seedSkills.js
 */

require('dotenv').config();
const { models, sequelize } = require('../src/db');

const skillsData = [
  // Programming Languages
  { name: 'JavaScript', category: 'Programming Language', description: 'Core web programming language' },
  { name: 'Python', category: 'Programming Language', description: 'General-purpose programming' },
  { name: 'Java', category: 'Programming Language', description: 'Enterprise and Android development' },
  { name: 'TypeScript', category: 'Programming Language', description: 'Type-safe JavaScript' },
  { name: 'C++', category: 'Programming Language', description: 'System programming' },
  { name: 'C#', category: 'Programming Language', description: '.NET development' },
  { name: 'Go', category: 'Programming Language', description: 'Modern systems programming' },
  { name: 'Rust', category: 'Programming Language', description: 'Safe systems programming' },
  { name: 'PHP', category: 'Programming Language', description: 'Web backend development' },
  { name: 'Ruby', category: 'Programming Language', description: 'Web development with Rails' },
  { name: 'Swift', category: 'Programming Language', description: 'iOS development' },
  { name: 'Kotlin', category: 'Programming Language', description: 'Android development' },

  // Frontend Frameworks
  { name: 'React', category: 'Frontend Framework', description: 'Component-based UI library' },
  { name: 'Vue.js', category: 'Frontend Framework', description: 'Progressive JavaScript framework' },
  { name: 'Angular', category: 'Frontend Framework', description: 'Full-featured frontend framework' },
  { name: 'Next.js', category: 'Frontend Framework', description: 'React framework with SSR' },
  { name: 'Svelte', category: 'Frontend Framework', description: 'Compiler-based framework' },
  { name: 'HTML/CSS', category: 'Frontend', description: 'Web markup and styling' },
  { name: 'Tailwind CSS', category: 'Frontend', description: 'Utility-first CSS framework' },

  // Backend Frameworks
  { name: 'Node.js', category: 'Backend Framework', description: 'JavaScript runtime' },
  { name: 'Express.js', category: 'Backend Framework', description: 'Node.js web framework' },
  { name: 'Django', category: 'Backend Framework', description: 'Python web framework' },
  { name: 'Flask', category: 'Backend Framework', description: 'Lightweight Python framework' },
  { name: 'Spring Boot', category: 'Backend Framework', description: 'Java enterprise framework' },
  { name: 'Laravel', category: 'Backend Framework', description: 'PHP web framework' },
  { name: 'Ruby on Rails', category: 'Backend Framework', description: 'Ruby web framework' },
  { name: 'ASP.NET', category: 'Backend Framework', description: '.NET web framework' },

  // Databases
  { name: 'PostgreSQL', category: 'Database', description: 'Advanced relational database' },
  { name: 'MySQL', category: 'Database', description: 'Popular relational database' },
  { name: 'MongoDB', category: 'Database', description: 'NoSQL document database' },
  { name: 'Redis', category: 'Database', description: 'In-memory data store' },
  { name: 'SQLite', category: 'Database', description: 'Lightweight embedded database' },
  { name: 'Oracle', category: 'Database', description: 'Enterprise database' },
  { name: 'Microsoft SQL Server', category: 'Database', description: 'Microsoft database' },

  // DevOps & Cloud
  { name: 'Docker', category: 'DevOps', description: 'Containerization platform' },
  { name: 'Kubernetes', category: 'DevOps', description: 'Container orchestration' },
  { name: 'AWS', category: 'Cloud Platform', description: 'Amazon Web Services' },
  { name: 'Azure', category: 'Cloud Platform', description: 'Microsoft Azure' },
  { name: 'Google Cloud', category: 'Cloud Platform', description: 'GCP services' },
  { name: 'CI/CD', category: 'DevOps', description: 'Continuous Integration/Deployment' },
  { name: 'Jenkins', category: 'DevOps', description: 'Automation server' },
  { name: 'GitHub Actions', category: 'DevOps', description: 'GitHub CI/CD' },
  { name: 'Terraform', category: 'DevOps', description: 'Infrastructure as Code' },
  { name: 'Linux', category: 'DevOps', description: 'Operating system' },

  // Mobile Development
  { name: 'React Native', category: 'Mobile Development', description: 'Cross-platform mobile' },
  { name: 'Flutter', category: 'Mobile Development', description: 'Cross-platform mobile' },
  { name: 'iOS Development', category: 'Mobile Development', description: 'Native iOS apps' },
  { name: 'Android Development', category: 'Mobile Development', description: 'Native Android apps' },

  // Data Science & ML
  { name: 'Machine Learning', category: 'Data Science', description: 'ML algorithms and models' },
  { name: 'Deep Learning', category: 'Data Science', description: 'Neural networks' },
  { name: 'TensorFlow', category: 'Data Science', description: 'ML framework' },
  { name: 'PyTorch', category: 'Data Science', description: 'ML framework' },
  { name: 'Data Analysis', category: 'Data Science', description: 'Analyzing datasets' },
  { name: 'Pandas', category: 'Data Science', description: 'Data manipulation library' },
  { name: 'NumPy', category: 'Data Science', description: 'Numerical computing' },
  { name: 'Scikit-learn', category: 'Data Science', description: 'ML library' },

  // Testing
  { name: 'Unit Testing', category: 'Testing', description: 'Testing individual components' },
  { name: 'Integration Testing', category: 'Testing', description: 'Testing system integration' },
  { name: 'Jest', category: 'Testing', description: 'JavaScript testing framework' },
  { name: 'Pytest', category: 'Testing', description: 'Python testing framework' },
  { name: 'Selenium', category: 'Testing', description: 'Browser automation' },

  // Version Control & Collaboration
  { name: 'Git', category: 'Version Control', description: 'Distributed version control' },
  { name: 'GitHub', category: 'Version Control', description: 'Code hosting platform' },
  { name: 'GitLab', category: 'Version Control', description: 'DevOps platform' },

  // Design & UX
  { name: 'UI/UX Design', category: 'Design', description: 'User interface design' },
  { name: 'Figma', category: 'Design', description: 'Design tool' },
  { name: 'Adobe XD', category: 'Design', description: 'Design tool' },

  // Soft Skills
  { name: 'Problem Solving', category: 'Soft Skills', description: 'Analytical thinking' },
  { name: 'Communication', category: 'Soft Skills', description: 'Effective communication' },
  { name: 'Team Collaboration', category: 'Soft Skills', description: 'Working in teams' },
  { name: 'Project Management', category: 'Soft Skills', description: 'Managing projects' },
  { name: 'Agile/Scrum', category: 'Soft Skills', description: 'Agile methodologies' },
];

async function seedSkills() {
  try {
    console.log('🌱 Seeding skills into database...');

    // Check if skills already exist
    const existingSkills = await models.Skill.count();
    if (existingSkills > 0) {
      console.log(`⚠️  Database already contains ${existingSkills} skills.`);
      console.log('   Do you want to clear and reseed? (Ctrl+C to cancel)');
      
      // Wait 3 seconds to allow cancellation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('   Clearing existing skills...');
      await models.Skill.destroy({ where: {}, force: true });
    }

    // Insert skills
    await models.Skill.bulkCreate(skillsData);

    console.log(`✅ Successfully seeded ${skillsData.length} skills!`);
    console.log('\nSkills by category:');
    
    const categories = [...new Set(skillsData.map(s => s.category))];
    categories.forEach(cat => {
      const count = skillsData.filter(s => s.category === cat).length;
      console.log(`   - ${cat}: ${count} skills`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding skills:', error);
    process.exit(1);
  }
}

// Run seeder
if (require.main === module) {
  seedSkills();
}

module.exports = { seedSkills, skillsData };
